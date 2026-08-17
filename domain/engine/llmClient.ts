/**
 * domain/engine/llmClient.ts
 * 通用LLM API客户端（OpenAI兼容格式）
 * 
 * 支持环境变量配置：
 * - LLM_API_URL: API端点（默认: https://api.openai.com/v1/chat/completions）
 * - LLM_API_KEY: API密钥
 * - LLM_MODEL: 模型名称（默认: gpt-4o-mini）
 * 
 * 如果未配置API密钥，返回null（调用方负责降级处理）
 * 
 * 支持并发控制：最多3个并发请求，避免API限流
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  success: boolean;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 60000; // 60秒超时（增加超时时间）
const MAX_RETRIES = 1;
const MAX_CONCURRENT = 3; // 最大并发请求数
let activeRequests = 0;
const requestQueue: Array<{ resolve: () => void; reject: (err: any) => void }> = [];

async function acquireToken(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return;
  }
  return new Promise((resolve, reject) => {
    requestQueue.push({ resolve, reject });
  });
}

function releaseToken(): void {
  activeRequests--;
  if (requestQueue.length > 0) {
    const next = requestQueue.shift()!;
    activeRequests++;
    next.resolve();
  }
}

function getLLMConfig() {
  let apiUrl = process.env.LLM_API_URL || '';
  const apiKey = process.env.LLM_API_KEY || '';
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';

  // 自动补全：如果 URL 是 base URL（不含 /chat/completions 结尾），自动拼接路径
  // 兼容写法：
  //   https://ddshub.cc/v1           → https://ddshub.cc/v1/chat/completions
  //   https://ddshub.cc/v1/          → https://ddshub.cc/v1/chat/completions
  //   https://ddshub.cc/v1/chat/completions → 保持不变
  if (apiUrl && !apiUrl.endsWith('/chat/completions')) {
    const trimmed = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    apiUrl = `${trimmed}/chat/completions`;
  }

  return { apiUrl, apiKey, model };
}

/**
 * 调用LLM API（OpenAI兼容格式）
 * 如果未配置API密钥，返回null
 * 支持并发控制（最多3个并发请求）
 */
export async function callLLM(
  prompt: string,
  systemPrompt: string = '你是一名严谨的数学教育专家。请严格按照要求输出标准JSON格式。',
): Promise<LLMResponse> {
  const { apiUrl, apiKey, model } = getLLMConfig();

  // 未配置API → 返回null，调用方负责降级
  if (!apiUrl || !apiKey) {
    return {
      content: '',
      success: false,
      error: 'LLM_API_URL或LLM_API_KEY未配置',
    };
  }

  // 获取并发令牌
  await acquireToken();

  try {
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.1, // 低温度保证稳定性
            max_tokens: 1000,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          lastError = `HTTP ${response.status}: ${errorText}`;
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 1000)); // 等待1秒重试
            continue;
          }
          return { content: '', success: false, error: lastError };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        if (!content) {
          return { content: '', success: false, error: 'LLM返回空内容' };
        }

        return { content, success: true };
      } catch (err: any) {
        lastError = err.message || String(err);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }
    }

    return { content: '', success: false, error: lastError };
  } finally {
    // 释放并发令牌
    releaseToken();
  }
}

/**
 * 从LLM响应中提取JSON
 * 处理markdown代码块包裹的JSON
 */
export function extractJSON(content: string): any | null {
  // 尝试直接解析
  try {
    return JSON.parse(content);
  } catch {
    // 继续
  }

  // 尝试从 ```json ... ``` 中提取
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      // 继续
    }
  }

  // 尝试找到第一个 { 和最后一个 } 之间的内容
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(content.substring(firstBrace, lastBrace + 1));
    } catch {
      // 继续
    }
  }

  return null;
}
