/**
 * domain/engine/llmGrader.ts
 * Layer 2: 单题结构化阅卷模块
 * 
 * 核心逻辑：
 * - 客观题(choice/fill) → 程序判分（grading.ts），不调用LLM
 * - 主观题(step) → LLM一题一调用，约束从标签池选错因
 * - LLM失败时降级为程序判分（gradeSteps）
 * 
 * 输出：统一的单题阅卷JSON
 */

import { gradeChoice, getChoiceEcCode, gradeFill, gradeSteps, Option, StepDef, StepAnswer, AnswerSpec } from './grading';
import { callLLM, extractJSON } from './llmClient';
import { buildGradingPrompt } from './promptTemplates';
import { EC_DEFINITIONS } from './ecDefinitions';

// ===== 类型定义 =====

export interface QuestionGradingInput {
  question_id: string;
  q_type: 'choice' | 'fill' | 'step';
  stem: string;
  correct_answer: string | null;
  options: Option[] | null;
  steps: StepDef[] | null;
  answer_spec: AnswerSpec | null;
  score: number;
  kp_code: string | null;
  ec_mapping: string[];
  literacy_codes: string[];
  error_label_pool: any[];
  scoring_rubric: any;
  grading_mode: 'auto' | 'llm';
  student_answer: any; // choice: "A", fill: "42", step: [{seq:1, answer:"..."}]
}

export interface QuestionGradingResult {
  question_id: string;
  full_score: number;
  student_score: number;
  is_correct: boolean;
  matched_error_labels: string[];
  brief_error_analysis: string;
  related_kp: string;
  grading_method: 'auto' | 'llm' | 'fallback';
}

// ===== 客观题自动判分 =====

function gradeChoiceQuestion(input: QuestionGradingInput): QuestionGradingResult {
  const studentKey = String(input.student_answer || '').trim().toUpperCase();
  const correctKey = (input.correct_answer || '').trim().toUpperCase();
  const isCorrect = gradeChoice(studentKey, correctKey);
  
  let ecCode: string | null = null;
  if (!isCorrect && input.options) {
    ecCode = getChoiceEcCode(studentKey, input.options);
  }
  
  return {
    question_id: input.question_id,
    full_score: input.score,
    student_score: isCorrect ? input.score : 0,
    is_correct: isCorrect,
    matched_error_labels: ecCode ? [ecCode] : [],
    brief_error_analysis: ecCode 
      ? `选${studentKey}，错因：${EC_DEFINITIONS[ecCode]?.label || ecCode}`
      : (isCorrect ? '答对' : '答错'),
    related_kp: input.kp_code || '',
    grading_method: 'auto',
  };
}

function gradeFillQuestion(input: QuestionGradingInput): QuestionGradingResult {
  const raw = String(input.student_answer || '').trim();
  const correctAnswer = input.correct_answer || '';
  const spec = input.answer_spec;
  
  // 空答案
  if (!raw) {
    return {
      question_id: input.question_id,
      full_score: input.score,
      student_score: 0,
      is_correct: false,
      matched_error_labels: [],
      brief_error_analysis: '未作答',
      related_kp: input.kp_code || '',
      grading_method: 'auto',
    };
  }
  
  const result = gradeFill(raw, correctAnswer, spec as AnswerSpec);
  
  let ecCode: string | null = null;
  if (!result.is_correct && input.ec_mapping.length > 0) {
    // 填空题错因从ec_mapping中匹配（取第一个）
    ecCode = input.ec_mapping[0];
  }
  
  return {
    question_id: input.question_id,
    full_score: input.score,
    student_score: result.is_correct ? input.score : 0,
    is_correct: result.is_correct,
    matched_error_labels: ecCode && !result.is_correct ? [ecCode] : [],
    brief_error_analysis: result.is_correct 
      ? '答对' 
      : (result.invalid_input ? `输入无效，无法解析` : `答案错误，错因：${EC_DEFINITIONS[ecCode || '']?.label || '计算错误'}`),
    related_kp: input.kp_code || '',
    grading_method: 'auto',
  };
}

// ===== 主观题LLM判分 =====

function gradeStepByProgram(input: QuestionGradingInput): QuestionGradingResult {
  const stepAnswers: StepAnswer[] = [];
  
  if (Array.isArray(input.student_answer)) {
    for (const ans of input.student_answer) {
      if (ans.seq !== undefined && ans.answer !== undefined) {
        stepAnswers.push({ seq: ans.seq, answer: String(ans.answer) });
      }
    }
  } else if (typeof input.student_answer === 'object' && input.student_answer !== null) {
    // 对象格式 {step1: "...", step2: "..."}
    for (const [key, value] of Object.entries(input.student_answer)) {
      const seqMatch = key.match(/\d+/);
      if (seqMatch) {
        stepAnswers.push({ seq: parseInt(seqMatch[0]), answer: String(value) });
      }
    }
  }
  
  if (stepAnswers.length === 0 || !input.steps) {
    return {
      question_id: input.question_id,
      full_score: input.score,
      student_score: 0,
      is_correct: false,
      matched_error_labels: [],
      brief_error_analysis: '未作答或作答格式无效',
      related_kp: input.kp_code || '',
      grading_method: 'fallback',
    };
  }
  
  const result = gradeSteps(stepAnswers, input.steps);
  
  // 匹配错因：检查哪些步骤错了
  const errorLabels: string[] = [];
  for (let i = 0; i < result.step_results.length; i++) {
    const sr = result.step_results[i];
    if (!sr.is_correct && input.steps[i]?.ec_mapping) {
      for (const ec of input.steps[i].ec_mapping) {
        if (!errorLabels.includes(ec)) {
          errorLabels.push(ec);
        }
      }
    }
  }
  
  const isCorrect = result.total_score === input.score;
  
  return {
    question_id: input.question_id,
    full_score: input.score,
    student_score: result.total_score,
    is_correct: isCorrect,
    matched_error_labels: errorLabels,
    brief_error_analysis: isCorrect 
      ? '全部步骤正确' 
      : `得分${result.total_score}/${input.score}分，错因：${errorLabels.map(e => EC_DEFINITIONS[e]?.label || e).join('、')}`,
    related_kp: input.kp_code || '',
    grading_method: 'fallback',
  };
}

// 批量LLM判分：一次调用处理多道题，大幅减少Token消耗
async function gradeStepsByLLMBatch(inputs: QuestionGradingInput[]): Promise<QuestionGradingResult[]> {
  if (inputs.length === 0) return [];
  
  // 如果只有一道题，仍然使用单题模式
  if (inputs.length === 1) {
    return [await gradeStepByLLM(inputs[0])];
  }
  
  // 批量处理：将多道题合并为一次调用
  const questionsData = inputs.map(input => {
    const rubricStr = JSON.stringify(input.scoring_rubric, null, 2);
    const poolStr = input.error_label_pool.map(e => `${e.code}: ${e.label}`).join('、');
    const answerStr = typeof input.student_answer === 'string' 
      ? input.student_answer 
      : JSON.stringify(input.student_answer);
    
    return {
      id: input.question_id,
      stem: input.stem.slice(0, 100), // 截断过长的题干
      rubric: input.scoring_rubric,
      score: input.score,
      answer: answerStr.slice(0, 200), // 截断过长的答案
    };
  });
  
  // 精简的批量Prompt模板
  const prompt = `你是一名严谨的初中数学阅卷教师。请对以下${inputs.length}道学生答题进行结构化阅卷。

## 阅卷规则
1. 严格按照每道题的踩分点打分
2. 错因只能从给定标签池中选取
3. 只输出JSON，禁止附带任何解释文字

## 待阅题目（共${inputs.length}道）
${JSON.stringify(questionsData, null, 2)}

## 每题可用的错因标签池
${inputs.map((input, i) => `题${i + 1}(${input.question_id}): ${input.error_label_pool.map(e => `${e.code}`).join(',')}`).join('\n')}

## 输出格式（数组，每道题一个元素）
{
  "results": [
    {
      "question_id": "题目ID",
      "student_score": 0,
      "is_correct": false,
      "matched_error_labels": ["错误标签代码"],
      "brief_error_analysis": "一句话错因分析"
    }
  ]
}`;
  
  // 调用LLM
  const llmResponse = await callLLM(prompt);
  
  if (!llmResponse.success) {
    console.warn(`[llmGrader] 批量LLM调用失败(${llmResponse.error})，降级为单题判分`);
    // 降级：逐题调用（但限制数量）
    if (inputs.length <= 5) {
      return Promise.all(inputs.map(input => gradeStepByLLM(input)));
    }
    // 题目太多时直接降级为程序判分
    return inputs.map(input => gradeStepByProgram(input));
  }
  
  // 解析批量返回
  const parsed = extractJSON(llmResponse.content);
  
  if (!parsed || !Array.isArray(parsed.results)) {
    console.warn(`[llmGrader] 批量LLM返回格式无法解析，降级为单题判分`);
    if (inputs.length <= 5) {
      return Promise.all(inputs.map(input => gradeStepByLLM(input)));
    }
    return inputs.map(input => gradeStepByProgram(input));
  }
  
  // 匹配结果
  const results: QuestionGradingResult[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const parsedResult = parsed.results.find((r: any) => r.question_id === input.question_id);
    
    if (!parsedResult) {
      console.warn(`[llmGrader] 批量LLM缺少题目的判分结果，降级为程序判分: ${input.question_id}`);
      results.push(gradeStepByProgram(input));
      continue;
    }
    
    // 校验matched_error_labels
    const validPoolCodes = new Set(input.error_label_pool.map(e => e.code));
    const matchedLabels = Array.isArray(parsedResult.matched_error_labels) 
      ? parsedResult.matched_error_labels.filter((label: string) => validPoolCodes.has(label))
      : [];
    
    results.push({
      question_id: input.question_id,
      full_score: input.score,
      student_score: Math.min(parsedResult.student_score ?? 0, input.score),
      is_correct: parsedResult.is_correct ?? false,
      matched_error_labels: matchedLabels,
      brief_error_analysis: parsedResult.brief_error_analysis || '',
      related_kp: input.kp_code || '',
      grading_method: 'llm',
    });
  }
  
  return results;
}

async function gradeStepByLLM(input: QuestionGradingInput): Promise<QuestionGradingResult> {
  // 构建精简的Prompt
  const rubricStr = JSON.stringify(input.scoring_rubric);
  const poolCodes = input.error_label_pool.map(e => `${e.code}:${e.label}`).join('|');
  const answerStr = typeof input.student_answer === 'string' 
    ? input.student_answer 
    : JSON.stringify(input.student_answer);
  
  const prompt = `你是一名严谨的初中数学阅卷教师。请对以下学生答题进行结构化阅卷。

## 题目
ID: ${input.question_id}
题干: ${input.stem.slice(0, 150)}
满分: ${input.score}
踩分点: ${rubricStr}
错因标签池: ${poolCodes}
学生作答: ${answerStr.slice(0, 200)}

## 输出JSON（禁止附带其他内容）
{
  "question_id": "${input.question_id}",
  "student_score": 0,
  "is_correct": false,
  "matched_error_labels": [],
  "brief_error_analysis": ""
}`;
  
  // 调用LLM
  const llmResponse = await callLLM(prompt);
  
  if (!llmResponse.success) {
    console.warn(`[llmGrader] LLM调用失败(${llmResponse.error})，降级为程序判分: ${input.question_id}`);
    return gradeStepByProgram(input);
  }
  
  // 解析LLM返回JSON
  const parsed = extractJSON(llmResponse.content);
  
  if (!parsed) {
    console.warn(`[llmGrader] LLM返回格式无法解析，降级为程序判分: ${input.question_id}`);
    return gradeStepByProgram(input);
  }
  
  // 校验matched_error_labels是否在标签池内
  const validPoolCodes = new Set(input.error_label_pool.map(e => e.code));
  const matchedLabels = Array.isArray(parsed.matched_error_labels) 
    ? parsed.matched_error_labels.filter((label: string) => validPoolCodes.has(label))
    : [];
  
  return {
    question_id: input.question_id,
    full_score: parsed.full_score ?? input.score,
    student_score: Math.min(parsed.student_score ?? 0, input.score),
    is_correct: parsed.is_correct ?? false,
    matched_error_labels: matchedLabels,
    brief_error_analysis: parsed.brief_error_analysis || '',
    related_kp: parsed.related_kp || input.kp_code || '',
    grading_method: 'llm',
  };
}

// ===== 主入口：统一判分函数 =====

/**
 * 对单道题进行结构化阅卷
 * - choice/fill: 程序判分（不调用LLM）
 * - step: LLM判分（失败时降级为程序判分）
 */
export async function gradeQuestion(input: QuestionGradingInput): Promise<QuestionGradingResult> {
  switch (input.q_type) {
    case 'choice':
      return gradeChoiceQuestion(input);
    
    case 'fill':
      return gradeFillQuestion(input);
    
    case 'step':
      if (input.grading_mode === 'llm') {
        return await gradeStepByLLM(input);
      }
      return gradeStepByProgram(input);
    
    default:
      return {
        question_id: input.question_id,
        full_score: input.score,
        student_score: 0,
        is_correct: false,
        matched_error_labels: [],
        brief_error_analysis: `未知题型: ${input.q_type}`,
        related_kp: input.kp_code || '',
        grading_method: 'auto',
      };
  }
}

/**
 * 批量判分（优化版：LLM批量处理 + Token节省）
 * 策略：将多道step题合并为一次LLM调用，减少Token消耗
 */
export async function gradeAllQuestions(inputs: QuestionGradingInput[]): Promise<QuestionGradingResult[]> {
  console.log(`[llmGrader] 开始批量判分，共${inputs.length}道题`);
  
  // 分离需要LLM判分的题和客观题
  const llmInputs: QuestionGradingInput[] = [];
  const llmInputIndices: number[] = [];
  const objectiveResults: Array<{ result: QuestionGradingResult; index: number }> = [];
  
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (input.q_type === 'step' && input.grading_mode === 'llm') {
      llmInputs.push(input);
      llmInputIndices.push(i);
    } else {
      // 客观题直接判分（同步）
      objectiveResults.push({ result: await gradeQuestion(input), index: i });
    }
  }
  
  console.log(`[llmGrader] 客观题: ${objectiveResults.length}道（直接判分）, LLM题: ${llmInputs.length}道（批量处理）`);
  
  // LLM题批量判分
  const BATCH_SIZE = 5; // 每批最多5道题
  const llmResults: Array<{ result: QuestionGradingResult; index: number }> = [];
  
  for (let batchStart = 0; batchStart < llmInputs.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, llmInputs.length);
    const batchInputs = llmInputs.slice(batchStart, batchEnd);
    const batchIndices = llmInputIndices.slice(batchStart, batchEnd);
    
    console.log(`[llmGrader] 处理第${batchStart/BATCH_SIZE + 1}批，共${batchInputs.length}道LLM题`);
    
    try {
      const batchResults = await gradeStepsByLLMBatch(batchInputs);
      for (let j = 0; j < batchResults.length; j++) {
        llmResults.push({ result: batchResults[j], index: batchIndices[j] });
      }
    } catch (err) {
      console.error(`[llmGrader] 批量处理异常，降级为单题判分: ${err}`);
      // 降级：逐题处理
      for (let j = 0; j < batchInputs.length; j++) {
        const result = await gradeStepByLLM(batchInputs[j]);
        llmResults.push({ result, index: batchIndices[j] });
      }
    }
  }
  
  // 合并结果并按原始顺序排序
  const allResults = [...objectiveResults, ...llmResults];
  allResults.sort((a, b) => a.index - b.index);
  
  const llmCount = allResults.filter(r => r.result.grading_method === 'llm').length;
  const fallbackCount = allResults.filter(r => r.result.grading_method === 'fallback').length;
  console.log(`[llmGrader] 判分完成: LLM=${llmCount}道, 程序=${objectiveResults.length}道, 降级=${fallbackCount}道`);
  
  return allResults.map(r => r.result);
}
