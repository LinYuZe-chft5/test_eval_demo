/**
 * scripts/test_llm_connection.ts
 * 
 * LLM API 连通性验证脚本（呆呆兽中转站 DDShub）
 * 
 * 用法：
 *   1. 确保 .env 文件已配置 LLM_API_URL / LLM_API_KEY / LLM_MODEL
 *   2. 执行：npx tsx scripts/test_llm_connection.ts
 * 
 * 验证项：
 *   - 环境变量是否正确读取
 *   - API URL 自动补全是否生效
 *   - 呆呆兽中转站鉴权是否通过（401/402/429 检测）
 *   - GPT-5.6-terra 模型是否可达
 *   - 五层流水线 Layer 2（单题阅卷） Prompt 格式是否正确返回JSON
 *   - 五层流水线 Layer 5（报告文案） Prompt 格式是否正确返回中文
 */

import 'dotenv/config';
import { callLLM, extractJSON } from '../domain/engine/llmClient';
import { buildGradingPrompt, GRADE_SYSTEM_PROMPT } from '../domain/engine/promptTemplates';
import { buildReportPrompt, REPORT_SYSTEM_PROMPT } from '../domain/engine/promptTemplates';

function maskKey(key: string): string {
  if (!key || key.length < 12) return '*** 未配置 ***';
  return `${key.slice(0, 6)}...${key.slice(-4)} (共${key.length}位)`;
}

function resolveActualUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.endsWith('/chat/completions')) return rawUrl;
  const trimmed = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
  return `${trimmed}/chat/completions`;
}

const SEPARATOR = '='.repeat(70);

async function step(title: string, fn: () => Promise<{ ok: boolean; info?: string }>) {
  console.log(`\n▶ ${title}`);
  try {
    const r = await fn();
    console.log(`  ${r.ok ? '✅ PASS' : '❌ FAIL'}${r.info ? ' — ' + r.info : ''}`);
    return r.ok;
  } catch (e: any) {
    console.log(`  ❌ FAIL — 异常: ${e.message || String(e)}`);
    return false;
  }
}

async function main() {
  console.log(SEPARATOR);
  console.log('  LLM 连通性测试 — 呆呆兽中转站 DDShub');
  console.log(SEPARATOR);

  // ===== 1. 环境变量读取 =====
  const rawUrl = process.env.LLM_API_URL || '';
  const apiKey = process.env.LLM_API_KEY || '';
  const model = process.env.LLM_MODEL || '';
  const actualUrl = resolveActualUrl(rawUrl);

  console.log('\n📋 环境变量读取：');
  console.log(`  LLM_API_URL (原始)  : ${rawUrl || '(空)'}`);
  console.log(`  LLM_API_URL (实际)  : ${actualUrl || '(空)'}`);
  console.log(`  LLM_API_KEY         : ${maskKey(apiKey)}`);
  console.log(`  LLM_MODEL           : ${model || '(空，默认gpt-4o-mini)'}`);

  const results: boolean[] = [];

  // ===== 2. 基础配置校验 =====
  results.push(await step('配置完整性检查', async () => {
    const missing: string[] = [];
    if (!rawUrl) missing.push('LLM_API_URL');
    if (!apiKey) missing.push('LLM_API_KEY');
    if (missing.length) return { ok: false, info: `缺失: ${missing.join(', ')}` };
    if (!apiKey.startsWith('sk-')) return { ok: false, info: 'LLM_API_KEY 不以 sk- 开头，请确认密钥格式' };
    return { ok: true, info: '配置完整，密钥格式正确' };
  }));

  if (!apiKey || !rawUrl) {
    console.log('\n⚠️  环境变量未配置，跳过后续网络测试。请在 .env 中填入正确参数后重试。');
    console.log(SEPARATOR);
    process.exit(1);
  }

  // ===== 3. 最小连通性测试（Ping） =====
  results.push(await step('最小连通性测试（Hi/OK）', async () => {
    const r = await callLLM('请只回复一个单词：OK', '你是一个简洁的助手。');
    if (!r.success) return { ok: false, info: r.error || '未知错误' };
    const content = r.content.trim().slice(0, 80);
    return { ok: true, info: `返回: "${content}"` };
  }));

  // ===== 4. Layer 2 — 单题阅卷 Prompt（要求返回标准 JSON） =====
  results.push(await step('Layer2 单题阅卷 Prompt（JSON格式）', async () => {
    // 构造一个最小的 step 题目阅卷场景，参数对齐 buildGradingPrompt 实际接口
    const prompt = buildGradingPrompt({
      question_id: 'Q-TEST-001',
      q_type: 'step',
      stem: '已知△ABC中，AB=3，BC=4，∠B=90°，求AC的长度。',
      scoring_rubric: {
        full_score: 6,
        steps: [
          { seq: 1, prompt: '识别三角形类型', max_score: 2, answer: '直角三角形，∠B=90°' },
          { seq: 2, prompt: '写出计算过程', max_score: 2, answer: 'AC² = AB² + BC² = 9 + 16 = 25' },
          { seq: 3, prompt: '给出最终结果', max_score: 2, answer: 'AC = 5' },
        ],
      },
      error_label_pool: [
        { code: 'EC-CONCEPT-CONFUSION', label: '概念混淆', description: '对定理概念理解错误或混淆适用条件' },
        { code: 'EC-CALC-ERROR', label: '计算错误', description: '运算过程中的算术错误' },
        { code: 'EC-CARELESS', label: '粗心大意', description: '抄题、漏看、多写等非知识性错误' },
        { code: 'EC-NO-ANSWER', label: '空白未作答', description: '未给出任何有效作答' },
      ],
      student_answer: [
        { seq: 1, answer: '这是直角三角形，因为有90度角' },
        { seq: 2, answer: 'AC平方=3平方+4平方=9+16=25' },
        { seq: 3, answer: '所以AC=5' },
      ],
    });

    const r = await callLLM(prompt, GRADE_SYSTEM_PROMPT);
    if (!r.success) return { ok: false, info: r.error || 'LLM调用失败' };

    const parsed = extractJSON(r.content);
    if (!parsed) {
      return {
        ok: false,
        info: `返回内容无法解析为JSON。前120字: ${r.content.slice(0, 120)}`,
      };
    }

    // 检查关键字段（对齐模板输出：student_score / matched_error_labels）
    const hasScore = typeof parsed.student_score === 'number';
    const hasLabels = Array.isArray(parsed.matched_error_labels);
    return {
      ok: hasScore && hasLabels,
      info: hasScore && hasLabels
        ? `full_score=${parsed.full_score}, student_score=${parsed.student_score}, is_correct=${parsed.is_correct}, matched=${JSON.stringify(parsed.matched_error_labels)}`
        : `JSON字段缺失 (student_score:${hasScore}, matched_error_labels:${hasLabels})`,
    };
  }));

  // ===== 5. Layer 5 — 报告文案 Prompt（要求返回中文结构化内容） =====
  results.push(await step('Layer5 报告文案 Prompt（中文JSON生成）', async () => {
    // 参数对齐 aggregator.ts 的 SummaryTable 类型
    const prompt = buildReportPrompt({
      grade: 'S3-01',
      total_score: 72,
      full_score: 100,
      pass_threshold: 60,
      is_passed: true,
      grade_level: 'B',
      radar_chart: {
        '代数运算': { score: 75, level: '良好', question_count: 10, valid: true },
        '几何推理': { score: 40, level: '待提升', question_count: 8, valid: true },
        '函数思想': { score: 60, level: '合格', question_count: 6, valid: true },
      },
      error_frequency_by_kp: [
        { kp_code: 'KP-GEO-003', kp_name: '勾股定理', error_count: 3, total_count: 5, error_rate: 0.6 },
        { kp_code: 'KP-ALG-012', kp_name: '一次函数图像', error_count: 2, total_count: 4, error_rate: 0.5 },
      ],
      error_frequency_by_label: [
        { code: 'EC-CONCEPT-CONFUSION', label: '概念混淆', count: 3, percentage: 0.375 },
        { code: 'EC-CARELESS', label: '粗心大意', count: 2, percentage: 0.25 },
        { code: 'EC-CALC-ERROR', label: '计算错误', count: 2, percentage: 0.25 },
      ],
      weak_knowledge_points: [
        { kp_code: 'KP-GEO-003', name: '勾股定理的逆定理', error_rate: 0.6, severity: '高' },
        { kp_code: 'KP-ALG-012', name: '一次函数图像平移', error_rate: 0.5, severity: '中' },
      ],
      genuine_response_stats: {
        total_questions: 41,
        genuine_answers: 35,
        genuine_ratio: 0.854,
        abandoned_count: 2,
      },
    });

    const r = await callLLM(prompt, REPORT_SYSTEM_PROMPT);
    if (!r.success) return { ok: false, info: r.error || 'LLM调用失败' };

    const parsed = extractJSON(r.content);
    if (!parsed) {
      const hasChinese = /[\u4e00-\u9fa5]/.test(r.content);
      return {
        ok: hasChinese && r.content.length > 50,
        info: hasChinese
          ? `未解析为JSON但有${r.content.length}字中文内容（前80字: ${r.content.slice(0, 80)}...）`
          : `非JSON且非中文内容，长度=${r.content.length}`,
      };
    }

    // 有 JSON 返回，检查关键字段
    const hasAnalysis = typeof parsed.error_analysis === 'string' && parsed.error_analysis.length > 0;
    const hasPlan = Array.isArray(parsed.four_week_plan);
    return {
      ok: hasAnalysis && hasPlan,
      info: hasAnalysis && hasPlan
        ? `OK — error_analysis ${parsed.error_analysis.length}字, plan=${parsed.four_week_plan.length}周`
        : `JSON字段缺失 (error_analysis:${hasAnalysis}, four_week_plan:${hasPlan})`,
    };
  }));

  // ===== 6. 模型名正确性验证（如果模型不存在通常会返回 model_not_found 错误） =====
  // 已在上面的实际调用中覆盖，如果模型名错误，callLLM会返回HTTP错误

  // ===== 汇总 =====
  console.log('\n' + SEPARATOR);
  const passed = results.filter(Boolean).length;
  const total = results.length;
  console.log(`📊 测试结果：${passed}/${total} 通过`);
  console.log(SEPARATOR);

  if (passed === total) {
    console.log('\n🎉 全部通过！五层流水线 LLM 调用链路已就绪。');
    console.log('   接下来可启动 dev server 体验真实测评闭环。\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  存在失败项，请根据上方错误信息排查：');
    console.log('   常见问题：');
    console.log('   · 401 Unauthorized → 检查 LLM_API_KEY 是否正确（密钥在 https://www.ddshub.cc/ 获取）');
    console.log('   · 402 Payment Required → 呆呆兽账户余额不足，请充值');
    console.log('   · 429 Too Many Requests → 请求过于频繁，请稍后重试');
    console.log('   · model_not_found → 检查 LLM_MODEL 是否为 gpt-5.6-terra');
    console.log('   · 超时 / ECONNRESET → 检查网络是否可达 ddshub.cc（Codespaces环境通常无此问题）\n');
    process.exit(1);
  }
}

main();
