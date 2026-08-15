/**
 * domain/engine/reportGenerator.ts
 * Layer 5: 最终LLM文案生成
 * 
 * 输入：仅传入Layer 3汇总统计结果（不含原始40+道答题记录）
 * 输出：个性化错因归纳 + 四周提升计划
 * 
 * 约束：
 * 1. 训练内容必须严格对应汇总表内薄弱知识点
 * 2. 每条训练内容写明：训练知识点 + 训练理由（对应学生同类错误）
 * 3. 杜绝"多加练习、夯实基础"等泛化话术
 * 
 * LLM未配置时降级为模板生成（保证Demo可用）
 */

import { callLLM, extractJSON } from './llmClient';
import { buildReportPrompt } from './promptTemplates';
import { EC_DEFINITIONS, LITERACY_DEFINITIONS } from './ecDefinitions';
import { isInvalidResponse } from './aggregator';
import type { SummaryTable } from './aggregator';

export interface GeneratedReport {
  error_analysis: string;
  four_week_plan: Array<{
    week: number;
    focus_kp: string;
    exercises: Array<{
      content: string;
      reason: string;
    }>;
  }>;
  generation_method: 'llm' | 'template';
}

/**
 * 模板生成（降级方案，LLM不可用时使用）
 */
function generateByTemplate(summary: SummaryTable): GeneratedReport {
  // 无效答卷
  if (isInvalidResponse(summary)) {
    return {
      error_analysis: `本次诊断为无效答卷。有效作答${summary.genuine_response_stats.genuine_answers}题（共${summary.genuine_response_stats.total_questions}题），有效作答率${(summary.genuine_response_stats.genuine_ratio * 100).toFixed(1)}%，低于25%阈值。无法生成能力评估和个性化建议，请重新认真作答后再提交。`,
      four_week_plan: [],
      generation_method: 'template',
    };
  }

  // 错因归纳
  const topErrors = summary.error_frequency_by_label.slice(0, 3);
  const weakKps = summary.weak_knowledge_points;

  let analysis = `总分${summary.total_score}/${summary.full_score}分，等级：${summary.grade_level}。`;

  if (topErrors.length > 0) {
    analysis += `主要错因集中在：${topErrors.map(e => `${e.label}(${Math.round(e.percentage * 100)}%)`).join('、')}。`;
  }

  if (weakKps.length > 0) {
    analysis += `薄弱知识点：${weakKps.map(k => `${k.name}(错误率${Math.round(k.error_rate * 100)}%)`).join('、')}。`;
  }

  if (topErrors.length > 0 && weakKps.length > 0) {
    analysis += `核心问题为${weakKps[0].name}模块中${topErrors[0].label}，建议优先针对性训练。`;
  }

  // 四周计划
  const plan: GeneratedReport['four_week_plan'] = [];
  const sortedWeakKps = [...weakKps].sort((a, b) => {
    const order = { '高': 3, '中': 2, '低': 1 };
    return order[b.severity] - order[a.severity];
  });

  for (let week = 0; week < Math.min(4, Math.max(1, sortedWeakKps.length)); week++) {
    const kp = sortedWeakKps[week % sortedWeakKps.length] || sortedWeakKps[0];
    if (!kp) break;

    // 找到该知识点的错误标签
    const kpErrors = summary.error_frequency_by_kp.find(e => e.kp_code === kp.kp_code);
    const errorLabel = kpErrors && summary.error_frequency_by_label.length > 0
      ? summary.error_frequency_by_label[0]
      : null;

    plan.push({
      week: week + 1,
      focus_kp: `${kp.kp_code} ${kp.name}`,
      exercises: [
        {
          content: `${kp.name}专项练习：针对${errorLabel?.label || '常见错误'}类型设计3-5道变式训练题`,
          reason: `该生在${kp.name}错误率${Math.round(kp.error_rate * 100)}%，${errorLabel ? `主要表现为${errorLabel.label}` : '需加强基础训练'}`,
        },
        {
          content: `${kp.name}错题重做与变式迁移：将原错题改编参数后重做，检验是否真正掌握`,
          reason: `通过平行题检验掌握度，避免"做对一次就以为会了"的假性掌握`,
        },
      ],
    });
  }

  return {
    error_analysis: analysis,
    four_week_plan: plan,
    generation_method: 'template',
  };
}

/**
 * LLM生成（正常方案）
 */
async function generateByLLM(summary: SummaryTable, grade: string): Promise<GeneratedReport | null> {
  // 构建Prompt
  const prompt = buildReportPrompt({
    grade,
    ...summary,
  });

  // 调用LLM
  const llmResponse = await callLLM(prompt);

  if (!llmResponse.success) {
    return null;
  }

  // 解析返回JSON
  const parsed = extractJSON(llmResponse.content);

  if (!parsed) {
    return null;
  }

  return {
    error_analysis: parsed.error_analysis || '',
    four_week_plan: Array.isArray(parsed.four_week_plan) ? parsed.four_week_plan : [],
    generation_method: 'llm',
  };
}

/**
 * 主入口：生成报告文案
 * 优先LLM生成，失败时降级为模板生成
 */
export async function generateReport(
  summary: SummaryTable,
  grade: string,
): Promise<GeneratedReport> {
  // 无效答卷直接用模板
  if (isInvalidResponse(summary)) {
    return generateByTemplate(summary);
  }

  // 尝试LLM生成
  try {
    const llmResult = await generateByLLM(summary, grade);
    if (llmResult) {
      return llmResult;
    }
  } catch (err) {
    console.warn('[reportGenerator] LLM生成失败，降级为模板:', err);
  }

  // 降级为模板生成
  return generateByTemplate(summary);
}
