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

async function gradeStepByLLM(input: QuestionGradingInput): Promise<QuestionGradingResult> {
  // 构建Prompt
  const prompt = buildGradingPrompt({
    question_id: input.question_id,
    stem: input.stem,
    q_type: input.q_type,
    scoring_rubric: input.scoring_rubric,
    error_label_pool: input.error_label_pool,
    student_answer: input.student_answer,
  });
  
  // 调用LLM
  const llmResponse = await callLLM(prompt);
  
  if (!llmResponse.success) {
    // LLM失败 → 降级为程序判分
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
  
  // 如果LLM返回了标签池外的码，记录但不展示
  const invalidLabels = Array.isArray(parsed.matched_error_labels)
    ? parsed.matched_error_labels.filter((label: string) => !validPoolCodes.has(label))
    : [];
  if (invalidLabels.length > 0) {
    console.warn(`[llmGrader] LLM返回了标签池外的错因(已过滤): ${invalidLabels.join(', ')}`);
  }
  
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
 * 批量判分（LLM题并行处理，客观题串行）
 * 由于llmClient有并发控制（最多3个），可以安全并行
 */
export async function gradeAllQuestions(inputs: QuestionGradingInput[]): Promise<QuestionGradingResult[]> {
  // 分离需要LLM判分的题和客观题
  const llmInputs: Array<{ input: QuestionGradingInput; index: number }> = [];
  const objectiveResults: Array<{ result: QuestionGradingResult; index: number }> = [];
  
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (input.q_type === 'step' && input.grading_mode === 'llm') {
      llmInputs.push({ input, index: i });
    } else {
      // 客观题直接判分（同步）
      objectiveResults.push({ result: await gradeQuestion(input), index: i });
    }
  }
  
  // LLM题并行判分（llmClient内部有并发控制）
  const llmResults = await Promise.all(
    llmInputs.map(async ({ input, index }) => {
      const result = await gradeQuestion(input);
      return { result, index };
    })
  );
  
  // 合并结果并按原始顺序排序
  const allResults = [...objectiveResults, ...llmResults];
  allResults.sort((a, b) => a.index - b.index);
  
  return allResults.map(r => r.result);
}
