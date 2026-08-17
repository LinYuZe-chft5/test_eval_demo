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
  action_checklist?: Array<{
    kp_code: string;
    name: string;
    severity: string;
    action: string;
  }>;
  generation_method: 'llm' | 'template';
}

/**
 * 模板生成（降级方案，LLM不可用时使用）
 * 高质量模板：基于具体错题知识点生成个性化内容
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

  // 生成具体的诊断综述（避免泛化）
  let analysis = `本次测评总分${summary.total_score}/${summary.full_score}分，综合评定为${summary.grade_level}。`;
  
  if (topErrors.length > 0) {
    const errorDesc = topErrors.map(e => `${EC_DEFINITIONS[e.code]?.label || e.code}（占比${Math.round(e.percentage * 100)}%）`).join('、');
    analysis += `主要错因集中在：${errorDesc}。`;
    
    // 添加具体的错因分析
    const topError = topErrors[0];
    const topErrorLabel = EC_DEFINITIONS[topError.code]?.label || topError.code;
    analysis += `表现为学生在解题过程中容易出现${topErrorLabel}的问题，`;
  }

  if (weakKps.length > 0) {
    const kpDesc = weakKps.slice(0, 3).map(k => `${k.name}（错误率${Math.round(k.error_rate * 100)}%）`).join('、');
    analysis += `薄弱知识点主要包括：${kpDesc}。`;
    
    // 添加针对性建议
    analysis += `建议优先从错误率最高的知识点入手，进行针对性训练。`;
  } else if (summary.error_frequency_by_kp.length > 0) {
    const topKp = summary.error_frequency_by_kp[0];
    analysis += `虽然没有特别薄弱的知识点，但仍需关注${topKp.kp_name}等模块的巩固。`;
  }

  // 四周计划 - 基于薄弱知识点生成具体的学习安排
  const plan: GeneratedReport['four_week_plan'] = [];
  const sortedWeakKps = weakKps.length > 0 
    ? [...weakKps].sort((a, b) => {
        const order = { '高': 3, '中': 2, '低': 1 };
        return order[b.severity] - order[a.severity];
      })
    : summary.error_frequency_by_kp.slice(0, 4).map(kp => ({
        kp_code: kp.kp_code,
        name: kp.kp_name,
        error_rate: kp.error_rate,
        severity: kp.error_rate >= 0.5 ? '高' as const : '中' as const,
      }));

  // 生成4周计划（确保至少有4周）
  const weeksToGenerate = Math.min(4, Math.max(1, sortedWeakKps.length));
  for (let week = 0; week < weeksToGenerate; week++) {
    const kp = sortedWeakKps[week % sortedWeakKps.length] || sortedWeakKps[0];
    if (!kp) break;

    // 找到该知识点的错误标签
    const topErrorLabel = topErrors[0] ? EC_DEFINITIONS[topErrors[0].code]?.label || topErrors[0].code : '基础概念';
    
    // 每周生成具体的训练内容
    const exercises = generateWeeklyExercises(kp, topErrorLabel, week);

    plan.push({
      week: week + 1,
      focus_kp: `${kp.name}`,
      exercises,
    });
  }

  // 生成行动清单（确保模板降级也有内容）
  const actionChecklist = generateActionChecklist(summary, sortedWeakKps);

  return {
    error_analysis: analysis,
    four_week_plan: plan,
    action_checklist: actionChecklist,
    generation_method: 'template',
  };
}

/**
 * 生成每周训练内容（避免模板化）
 */
function generateWeeklyExercises(
  kp: { kp_code: string; name: string; error_rate: number; severity: string },
  topErrorLabel: string,
  week: number,
): Array<{ content: string; reason: string }> {
  const content = [];
  
  if (week === 0) {
    // 第1周：基础概念巩固
    content.push({
      content: `${kp.name}基础概念复习：每天做5道基础练习题，重点回顾${topErrorLabel}相关的基本方法和公式`,
      reason: `该生在${kp.name}模块错误率${Math.round(kp.error_rate * 100)}%，需要从基础抓起，先确保概念清晰`,
    });
    content.push({
      content: `${kp.name}典型例题分析：每天精读2-3道典型例题，理解解题思路和关键步骤`,
      reason: `通过分析标准解法，建立正确的思维定势，避免${topErrorLabel}的重复错误`,
    });
  } else if (week === 1) {
    // 第2周：变式训练
    content.push({
      content: `${kp.name}变式题训练：每天做6-8道变式练习题，改变题目条件或问法，但核心知识点不变`,
      reason: `通过变式训练检验是否真正掌握，避免"做对一道就以为会了"的假性掌握`,
    });
    content.push({
      content: `${kp.name}错题重做：将之前做错的题目重新做一遍，检验${topErrorLabel}是否已纠正`,
      reason: `错题重做是检验学习效果的最佳方式，确保同一类型的错误不再重复`,
    });
  } else if (week === 2) {
    // 第3周：综合应用
    content.push({
      content: `${kp.name}综合应用题：每天做3-5道涉及多个知识点的综合题，训练知识迁移能力`,
      reason: `${kp.name}通常与其他知识点联合考查，需要学会在复杂情境中识别和应用`,
    });
    content.push({
      content: `${kp.name}限时训练：在20-30分钟内完成一组练习题，提高解题速度和准确率`,
      reason: `限时训练模拟考试环境，帮助学生在压力下保持冷静，减少${topErrorLabel}`,
    });
  } else {
    // 第4周：查漏补缺
    content.push({
      content: `${kp.name}模拟测试：完成一套包含${kp.name}相关题目的小测，检验三周学习成果`,
      reason: `通过模拟测试全面检验学习效果，找出仍需加强的薄弱环节`,
    });
    content.push({
      content: `${kp.name}针对性补漏：根据测试结果，对仍有问题的知识点进行重点突破`,
      reason: `学习不是一蹴而就的，需要根据实际效果灵活调整学习重点`,
    });
  }
  
  return content;
}

/**
 * 生成行动清单（模板降级方案）
 * 基于薄弱知识点和错误频次生成具体的、个性化的行动建议
 */
function generateActionChecklist(
  summary: SummaryTable,
  sortedWeakKps: Array<{ kp_code: string; name: string; error_rate: number; severity: string }>,
): GeneratedReport['action_checklist'] {
  const checklist: GeneratedReport['action_checklist'] = [];
  
  // 优先使用薄弱知识点
  const sourceKps = sortedWeakKps.length > 0 
    ? sortedWeakKps 
    : summary.error_frequency_by_kp.slice(0, 5).map(kp => ({
        kp_code: kp.kp_code,
        name: kp.kp_name,
        error_rate: kp.error_rate,
        severity: kp.error_rate >= 0.75 ? '高' as const : kp.error_rate >= 0.5 ? '中' as const : '低' as const,
      }));

  // 生成行动清单（最多5条）
  for (let i = 0; i < Math.min(5, sourceKps.length); i++) {
    const kp = sourceKps[i];
    const errorRate = Math.round((kp.error_rate || 0) * 100);
    
    // 确定级别和颜色
    let level: 'red' | 'yellow' | 'green' = 'yellow';
    let levelText = '中等';
    let dailyCount = 5;
    
    if (kp.severity === '高' || errorRate >= 75) {
      level = 'red';
      levelText = '严重';
      dailyCount = 8;
    } else if (kp.severity === '中' || errorRate >= 50) {
      level = 'yellow';
      levelText = '中等';
      dailyCount = 6;
    } else {
      level = 'green';
      levelText = '良好';
      dailyCount = 4;
    }

    // 生成具体的行动建议
    let action = '';
    if (level === 'red') {
      action = `重点补强${kp.name}，该知识点错误率高达${errorRate}%，建议每天做${dailyCount}道基础变式题，从教材例题开始，确保概念准确无误，配合错题本逐项攻克`;
    } else if (level === 'yellow') {
      action = `巩固${kp.name}，该知识点错误率${errorRate}%，建议每天做${dailyCount}道练习题，重点关注错题重做和变式训练，理解解题思路而非死记硬背`;
    } else {
      action = `保持${kp.name}的良好状态，该知识点错误率${errorRate}%，建议每天做${dailyCount}道综合题，提升知识迁移能力，适当挑战难度更高的题目`;
    }

    checklist.push({
      kp_code: kp.kp_code,
      name: kp.name,
      severity: levelText,
      action,
    });
  }

  return checklist;
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

  // 诊断日志：LLM调用结果
  console.log('[reportGenerator] LLM调用结果:', {
    success: llmResponse.success,
    error: llmResponse.error?.substring(0, 100),
    contentPrefix: llmResponse.content?.substring(0, 200) || '(空)',
    contentLength: llmResponse.content?.length || 0,
  });

  if (!llmResponse.success) {
    console.warn('[reportGenerator] LLM调用失败:', llmResponse.error);
    return null;
  }

  // 解析返回JSON
  const parsed = extractJSON(llmResponse.content);

  // 诊断日志：JSON解析结果
  console.log('[reportGenerator] JSON解析结果:', {
    parsedSuccess: !!parsed,
    parsedKeys: parsed ? Object.keys(parsed) : [],
    error_analysis: parsed?.error_analysis?.substring(0, 100) || '(无)',
    four_week_plan_length: parsed?.four_week_plan?.length || 0,
    has_action_checklist: !!parsed?.action_checklist,
  });

  if (!parsed) {
    console.warn('[reportGenerator] JSON解析失败，降级为模板生成');
    return null;
  }

  return {
    error_analysis: parsed.error_analysis || '',
    four_week_plan: Array.isArray(parsed.four_week_plan) ? parsed.four_week_plan : [],
    action_checklist: Array.isArray(parsed.action_checklist) ? parsed.action_checklist : [],
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
    console.log('[reportGenerator] 无效答卷，使用模板生成');
    const result = generateByTemplate(summary);
    return result;
  }

  // 尝试LLM生成
  try {
    const llmResult = await generateByLLM(summary, grade);
    if (llmResult) {
      console.log('[reportGenerator] ✅ LLM生成成功:', {
        generation_method: llmResult.generation_method,
        four_week_plan_length: llmResult.four_week_plan.length,
        action_checklist_length: llmResult.action_checklist?.length || 0,
        error_analysis: llmResult.error_analysis?.substring(0, 100),
      });
      return llmResult;
    }
  } catch (err) {
    console.warn('[reportGenerator] LLM生成异常，降级为模板:', err);
  }

  // 降级为模板生成
  console.log('[reportGenerator] ⚠️ 降级为模板生成');
  return generateByTemplate(summary);
}
