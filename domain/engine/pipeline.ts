/**
 * domain/engine/pipeline.ts
 * 五层串行流水线编排器
 * 
 * 严格顺序执行：Layer1(元数据) → Layer2(单题阅卷) → Layer3(聚合统计) → Layer4(素材组装) → Layer5(LLM文案)
 */

import { gradeAllQuestions, type QuestionGradingInput } from './llmGrader';
import { aggregate, isInvalidResponse, type QuestionMeta, type SummaryTable } from './aggregator';
import { assembleReport, extractLLMInput, type ReportMaterial } from './reportAssembler';
import { generateReport, type GeneratedReport } from './reportGenerator';
import { EC_DEFINITIONS } from './ecDefinitions';

export interface PipelineInput {
  questions: any[]; // 从数据库查出的题目数据
  studentAnswers: Record<string, any>; // question_id → student_answer
  behaviorData: Record<string, { time_spent_ms: number; modify_count: number; behavior_tag?: string }>;
  reportMeta: {
    student_name: string;
    grade: string;
    test_date: string;
    sku_code: string;
    sku_label: string;
  };
}

export interface PipelineOutput {
  summary_table: SummaryTable;
  grading_results: any[];
  report_material: ReportMaterial;
  generated_report: GeneratedReport;
  is_invalid: boolean;
}

/**
 * 判断是否为真实有效作答
 */
function isGenuineResponse(
  questionId: string,
  studentAnswer: any,
  behavior: { time_spent_ms: number; modify_count: number; behavior_tag?: string } | undefined,
  gradingResult: { is_correct: boolean; student_score: number },
): boolean {
  // a) 做对了
  if (gradingResult.is_correct) return true;
  // b) 得分>0
  if (gradingResult.student_score > 0) return true;
  // c) 有修改记录
  if (behavior?.modify_count && behavior.modify_count > 0) return true;
  // d) 至少思考15秒
  if (behavior?.time_spent_ms && behavior.time_spent_ms >= 15000) return true;
  // e) 有输入但答错（有answer且非空）
  if (studentAnswer !== null && studentAnswer !== undefined && studentAnswer !== '') {
    // 有实际输入内容
    if (typeof studentAnswer === 'string' && studentAnswer.trim() !== '') return true;
    if (Array.isArray(studentAnswer) && studentAnswer.length > 0) return true;
    if (typeof studentAnswer === 'object' && Object.keys(studentAnswer).length > 0) return true;
  }
  return false;
}

/**
 * 执行五层流水线
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const { questions, studentAnswers, behaviorData, reportMeta } = input;

  console.log('[Pipeline] Layer 1: 题库元数据已加载', questions.length, '道题');

  // ===== Layer 2: 单题阅卷 =====
  console.log('[Pipeline] Layer 2: 开始单题阅卷');

  const gradingInputs: QuestionGradingInput[] = questions.map(q => {
    const questionId = `${q.sku_code}-D${q.day_tag}-Q${String(q.seq_no).padStart(2, '0')}`;
    return {
      question_id: questionId,
      q_type: q.q_type,
      stem: q.stem,
      correct_answer: q.correct_answer,
      options: q.options,
      steps: q.steps,
      answer_spec: q.answer_spec,
      score: q.score,
      kp_code: q.kp_code,
      ec_mapping: q.ec_mapping || [],
      literacy_codes: q.literacy_codes || [],
      error_label_pool: q.error_label_pool || [],
      scoring_rubric: q.scoring_rubric || { full_score: q.score, rubric_items: [] },
      grading_mode: q.grading_mode || (q.q_type === 'step' ? 'llm' : 'auto'),
      student_answer: studentAnswers[questionId] ?? studentAnswers[q.id] ?? null,
    };
  });

  const gradingResults = await gradeAllQuestions(gradingInputs);
  console.log('[Pipeline] Layer 2: 阅卷完成', gradingResults.length, '道题,',
    'LLM判分:', gradingResults.filter(r => r.grading_method === 'llm').length, '道,',
    '程序判分:', gradingResults.filter(r => r.grading_method === 'auto').length, '道,',
    '降级判分:', gradingResults.filter(r => r.grading_method === 'fallback').length, '道');

  // ===== 判断真实有效作答 =====
  const genuineSet = new Set<string>();
  for (const input of gradingInputs) {
    const result = gradingResults.find(r => r.question_id === input.question_id);
    if (!result) continue;

    const behavior = behaviorData[input.question_id];
    if (isGenuineResponse(input.question_id, input.student_answer, behavior, result)) {
      genuineSet.add(input.question_id);
    }
  }
  console.log('[Pipeline] 真实有效作答:', genuineSet.size, '/', questions.length);

  // ===== Layer 3: 聚合统计 =====
  console.log('[Pipeline] Layer 3: 程序聚合统计');

  const questionMetas: QuestionMeta[] = questions.map(q => ({
    question_id: `${q.sku_code}-D${q.day_tag}-Q${String(q.seq_no).padStart(2, '0')}`,
    q_type: q.q_type,
    score: q.score,
    kp_code: q.kp_code,
    literacy_codes: q.literacy_codes || [],
    radar_dimensions: q.radar_dimensions || [],
    knowledge_points: q.knowledge_points || {
      primary: { code: q.kp_code, name: q.kp_code },
      secondary: null,
    },
  }));

  const summaryTable = aggregate({
    gradingResults,
    questions: questionMetas,
    genuineResponses: genuineSet,
  });

  const isInvalid = isInvalidResponse(summaryTable);
  console.log('[Pipeline] Layer 3: 总分', summaryTable.total_score, '/', summaryTable.full_score,
    ', 等级:', summaryTable.grade_level, ', 无效答卷:', isInvalid);

  // ===== Layer 4: 素材组装 =====
  console.log('[Pipeline] Layer 4: 报告素材组装');

  const reportMaterial = assembleReport({
    summaryTable,
    gradingResults,
    isInvalid,
    reportMeta,
  });

  // ===== Layer 5: LLM文案生成 =====
  console.log('[Pipeline] Layer 5: LLM文案生成');

  const generatedReport = await generateReport(summaryTable, reportMeta.grade);
  console.log('[Pipeline] Layer 5: 生成完成, 方法:', generatedReport.generation_method,
    ', 计划周数:', generatedReport.four_week_plan.length);

  return {
    summary_table: summaryTable,
    grading_results: gradingResults,
    report_material: reportMaterial,
    generated_report: generatedReport,
    is_invalid: isInvalid,
  };
}
