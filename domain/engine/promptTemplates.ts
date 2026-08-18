/**
 * domain/engine/promptTemplates.ts
 * 五层流水线Prompt模板管理
 * 
 * Layer 2: 单题阅卷Prompt
 * Layer 5: 报告生成Prompt
 */

// ===== 系统提示词常量（供callLLM第二参数使用 & 测试脚本引用） =====

export const GRADE_SYSTEM_PROMPT =
  '你是一名严谨的初中数学阅卷教师。请严格按照评分规则判分，错因只能从给定标签池中选取，最终只输出标准JSON格式，禁止任何解释文字。';

export const REPORT_SYSTEM_PROMPT =
  '你是一名资深数学教育诊断分析师。请基于学情统计结果生成个性化诊断文案，杜绝泛化话术，最终只输出标准JSON格式。';

// ===== Layer 2: 单题LLM阅卷Prompt =====

export function buildGradingPrompt(params: {
  question_id: string;
  stem: string;
  q_type: string;
  scoring_rubric: any;
  error_label_pool: any[];
  student_answer: any;
}): string {
  const { question_id, stem, scoring_rubric, error_label_pool, student_answer } = params;

  const rubricStr = JSON.stringify(scoring_rubric, null, 2);
  const poolStr = error_label_pool.map(e => `  - ${e.code}: ${e.label} (${e.description})`).join('\n');
  const answerStr = typeof student_answer === 'string' 
    ? student_answer 
    : JSON.stringify(student_answer, null, 2);

  return `你是一名严谨的初中数学阅卷教师。请对学生的答题进行结构化阅卷。

## 题目信息
- 题目ID: ${question_id}
- 题干: ${stem}

## 评分踩分点
${rubricStr}

## 预设错误标签池（你只能从此池中选择错误标签，禁止编造标签池外的错因）
${poolStr}

## 学生作答
${answerStr}

## 阅卷要求
1. 严格按照踩分点打分，每步独立判分
2. 如果学生答错，必须从上方【预设错误标签池】中选择匹配的标签
3. 简短分析错因（一句话，指出具体错在哪里）
4. 只输出JSON，禁止附带任何解释文字

## 输出格式（严格按此JSON结构）
{
  "question_id": "${question_id}",
  "full_score": ${scoring_rubric.full_score},
  "student_score": 0,
  "is_correct": false,
  "matched_error_labels": [],
  "brief_error_analysis": "",
  "related_kp": ""
}`;
}

// ===== Layer 5: 报告生成Prompt（精简版，节省Token） =====

export function buildReportPrompt(summaryTable: any, grade: string = ''): string {
  // 只提取关键统计数据，避免传递完整summaryTable
  const { total_score, full_score, grade_level, genuine_response_stats } = summaryTable;
  const topErrors = summaryTable.error_frequency_by_label?.slice(0, 3) || [];
  const weakKps = summaryTable.weak_knowledge_points?.slice(0, 5) || [];
  const kpStats = summaryTable.error_frequency_by_kp?.slice(0, 8) || [];
  
  // 构建精简的统计摘要
  const statsSummary = {
    score: `${total_score}/${full_score}`,
    level: grade_level,
    genuine_ratio: genuine_response_stats?.genuine_ratio ?? 0,
    top_errors: topErrors.map((e: any) => ({ code: e.code, label: e.label, pct: Math.round(e.percentage * 100) })),
    weak_points: weakKps.map((k: any) => ({ kp_code: k.kp_code, name: k.name, error_rate: Math.round(k.error_rate * 100), severity: k.severity })),
    kp_stats: kpStats.map((k: any) => ({ kp_code: k.kp_code, name: k.kp_name, error_rate: Math.round(k.error_rate * 100), error_count: k.error_count, total: k.total_count })),
  };

  return `你是一名资深数学教育诊断分析师。请基于以下学情统计结果，为初中生生成个性化诊断报告。

## 学情统计（精简版）
${JSON.stringify(statsSummary)}

## 报告要求（严格遵循）
1. error_analysis：200字以内，必须具体指出核心问题模式
2. four_week_plan：4周提升计划，每周1个知识点，训练内容必须包含具体题量和类型
3. action_checklist：行动清单，每条包含知识点名称、严重程度、具体行动建议
4. 杜绝"多加练习、夯实基础"等泛化话术
5. 必须使用中文，知识点用中文名

## 输出格式（只输出JSON）
{"error_analysis":"200字以内个性化分析","four_week_plan":[{"week":1,"focus_kp":"知识点中文名","exercises":[{"content":"具体训练内容含每日题量","reason":"训练理由"}]}],"action_checklist":[{"kp_code":"KP代码","name":"中文名","severity":"高/中/低","action":"具体建议含题量"}]}`;
}
