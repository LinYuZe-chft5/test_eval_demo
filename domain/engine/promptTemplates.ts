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

// ===== Layer 5: 报告生成Prompt =====

export function buildReportPrompt(summaryTable: any): string {
  const summaryStr = JSON.stringify(summaryTable, null, 2);

  // 提取关键信息用于Prompt
  const topErrors = summaryTable.error_frequency_by_label?.slice(0, 3) || [];
  const weakKps = summaryTable.weak_knowledge_points?.slice(0, 5) || [];
  
  return `你是一名资深数学教育诊断分析师。请基于以下学情统计结果，为一位初中生生成个性化诊断报告文案。

## 学生学情汇总数据
${summaryStr}

## 关键信息摘要
- 总得分: ${summaryTable.total_score}/${summaryTable.full_score}
- 等级评定: ${summaryTable.grade_level}
- 主要错因标签: ${topErrors.map((e: any) => e.label).join('、') || '无'}
- 薄弱知识点: ${weakKps.map((k: any) => `${k.name}(错误率${Math.round(k.error_rate * 100)}%)`).join('、') || '无'}

## 报告生成要求

### 1. 综合错因归纳（error_analysis）200字以内
- 必须结合具体的错误标签和薄弱知识点进行分析
- 指出学生的核心问题模式，而非泛泛而谈
- 示例："学生在解方程时频繁出现移项变号错误，同时对含参方程的讨论不完整，表现为基础概念不牢和逻辑思维跳跃两个核心问题"

### 2. 四周提升计划（four_week_plan）
- 每周聚焦1-2个薄弱知识点（按错误率从高到低排序）
- 每周训练要有明确的阶段目标：
  * 第1周：基础概念巩固（每天5-8道基础题）
  * 第2周：变式训练（每天6-10道变式题）
  * 第3周：综合应用（每天3-5道综合题）
  * 第4周：查漏补缺（模拟测试+针对性补漏）
- 每条训练内容必须写明：训练知识点 + 训练理由（对应学生的具体错误表现）
- 杜绝"多加练习、夯实基础"等泛化话术
- 必须使用中文，避免使用代码或英文缩写

### 3. 格式要求
- 如果genuine_ratio < 0.25，直接返回空计划和"无效答卷"提示
- 只输出JSON，禁止附带多余解释
- JSON格式必须符合以下结构

## 输出格式（严格按此JSON结构）
{
  "error_analysis": "200字以内的个性化错因归纳，必须具体，不能泛化",
  "four_week_plan": [
    {
      "week": 1,
      "focus_kp": "知识点名称（用中文）",
      "exercises": [
        {
          "content": "具体训练内容（含每日题量）",
          "reason": "训练理由（对应学生某类错误的具体表现）"
        }
      ]
    }
  ]
}`;
}
