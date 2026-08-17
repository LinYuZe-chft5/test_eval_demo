/**
 * domain/engine/pipeline.ts
 * 五层串行流水线编排器
 * 
 * 严格顺序执行：Layer1(元数据) → Layer2(单题阅卷) → Layer3(聚合统计) → Layer4(素材组装) → Layer5(LLM文案)
 * 
 * 重要：数据库查询结果经过 lib/supabase.ts Prisma Shim 转换，
 * 所有字段均为 camelCase（如 skuCode, dayTag, seqNo, qType）
 */

import { gradeAllQuestions, type QuestionGradingInput } from './llmGrader';
import { aggregate, isInvalidResponse, type QuestionMeta, type SummaryTable } from './aggregator';
import { assembleReport, extractLLMInput, type ReportMaterial } from './reportAssembler';
import { generateReport, type GeneratedReport } from './reportGenerator';
import { EC_DEFINITIONS } from './ecDefinitions';

export interface PipelineInput {
  questions: any[];
  studentAnswers: Record<string, any>;
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
 * 统一题目ID生成（与 submit route 的 generateReport 保持一致）
 */
function buildQuestionId(q: any): string {
  const sku = q.skuCode ?? q.sku_code ?? '';
  const day = q.dayTag ?? q.day_tag ?? 1;
  const seq = q.seqNo ?? q.seq_no ?? 1;
  return `${sku}-D${day}-Q${String(seq).padStart(2, '0')}`;
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
  // b) 得分>0（分步题部分得分也算）
  if (gradingResult.student_score > 0) return true;
  // c) 有修改记录
  if (behavior?.modify_count && behavior.modify_count > 0) return true;
  // d) 至少思考5秒（降低阈值，Demo环境无需15秒）
  if (behavior?.time_spent_ms && behavior.time_spent_ms >= 5000) return true;
  // e) 有输入但答错（有answer且非空）
  if (studentAnswer !== null && studentAnswer !== undefined) {
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

  // ===== DIAGNOSTIC: 检查数据输入质量 =====
  const totalStudentsWithAnswers = Object.values(studentAnswers).filter(v => v !== null && v !== undefined && v !== '').length;
  const totalBehaviors = Object.values(behaviorData).filter(v => v && (v.time_spent_ms > 0 || v.modify_count > 0)).length;
  console.log(`[Pipeline] DIAGNOSTIC: studentAnswers非空=${totalStudentsWithAnswers}/${Object.keys(studentAnswers).length}, behaviorData有值=${totalBehaviors}/${Object.keys(behaviorData).length}`);

  // 打印前5个题目的答题和行为数据
  const diagSample = questions.slice(0, 5);
  for (const q of diagSample) {
    const qid = buildQuestionId(q);
    const ans = studentAnswers[qid];
    const beh = behaviorData[qid];
    const qType = q.qType ?? q.q_type;
    const ansStr = ans === null ? 'null' : (typeof ans === 'string' ? `"${ans.slice(0, 30)}"` : Array.isArray(ans) ? `[${ans.length} items]` : JSON.stringify(ans).slice(0, 40));
    console.log(`[Pipeline] DIAGNOSTIC ${qid}: qType=${qType}, answer=${ansStr}, timeMs=${beh?.time_spent_ms ?? 0}, modCount=${beh?.modify_count ?? 0}`);
  }

  // ===== Layer 2: 单题阅卷 =====
  console.log('[Pipeline] Layer 2: 开始单题阅卷');

  const gradingInputs: QuestionGradingInput[] = questions.map(q => {
    const questionId = buildQuestionId(q);
    return {
      question_id: questionId,
      q_type: q.qType ?? q.q_type,
      stem: q.stem,
      correct_answer: q.correctAnswer ?? q.correct_answer,
      options: q.options,
      steps: q.steps,
      answer_spec: q.answerSpec ?? q.answer_spec,
      score: q.score,
      kp_code: q.kpCode ?? q.kp_code,
      ec_mapping: q.ecMapping ?? q.ec_mapping ?? [],
      literacy_codes: q.literacyCodes ?? q.literacy_codes ?? [],
      error_label_pool: q.errorLabelPool ?? q.error_label_pool ?? [],
      scoring_rubric: (q.scoringRubric ?? q.scoring_rubric) ?? { full_score: q.score, rubric_items: [] },
      grading_mode: (q.gradingMode ?? q.grading_mode) ?? ((q.qType ?? q.q_type) === 'step' ? 'llm' : 'auto'),
      student_answer: studentAnswers[questionId] ?? studentAnswers[q.id] ?? null,
    };
  });

  const gradingResults = await gradeAllQuestions(gradingInputs);
  console.log('[Pipeline] Layer 2: 阅卷完成', gradingResults.length, '道题,',
    'LLM判分:', gradingResults.filter(r => r.grading_method === 'llm').length, '道,',
    '程序判分:', gradingResults.filter(r => r.grading_method === 'auto').length, '道,',
    '降级判分:', gradingResults.filter(r => r.grading_method === 'fallback').length, '道');

  // 打印前5个阅卷结果
  for (let i = 0; i < Math.min(5, gradingResults.length); i++) {
    const r = gradingResults[i];
    console.log(`[Pipeline] GRADED ${r.question_id}: score=${r.student_score}/${r.full_score}, correct=${r.is_correct}, method=${r.grading_method}, errLabels=${r.matched_error_labels?.length ?? 0}`);
  }

  // ===== 判断真实有效作答 =====
  const genuineSet = new Set<string>();
  for (const input of gradingInputs) {
    const result = gradingResults.find(r => r.question_id === input.question_id);
    if (!result) continue;

    const behavior = behaviorData[input.question_id];
    const isGenuine = isGenuineResponse(input.question_id, input.student_answer, behavior, result);
    if (isGenuine) {
      genuineSet.add(input.question_id);
    }
    // 诊断：打印前5个非真实作答的原因
    if (!isGenuine && genuineSet.size < 5) {
      const ans = input.student_answer;
      const ansDesc = ans === null ? 'null' : (typeof ans === 'string' && ans === '' ? '空字符串' : Array.isArray(ans) && ans.length === 0 ? '空数组' : '有值');
      console.log(`[Pipeline] NOT-GENUINE ${input.question_id}: answer=${ansDesc}, score=${result.student_score}, timeMs=${behavior?.time_spent_ms ?? 0}, modCount=${behavior?.modify_count ?? 0}`);
    }
  }
  console.log('[Pipeline] 真实有效作答:', genuineSet.size, '/', questions.length);

  // ===== Layer 3: 聚合统计 =====
  console.log('[Pipeline] Layer 3: 程序聚合统计');

  // 知识点名称映射表（从题库数据中提取的中文名）
  const KP_NAME_MAP: Record<string, string> = {
    'KP-P.4': '数与式',
    'KP-P.5': '方程与不等式',
    'KP-P.6': '函数',
    'KP-P.7': '图形与几何',
    'KP-P.8': '统计与概率',
    'KP-P.9': '综合应用',
  };

  const questionMetas: QuestionMeta[] = questions.map(q => {
    const questionId = buildQuestionId(q);
    const literacyCodes = q.literacyCodes ?? q.literacy_codes ?? [];
    const radarDims = q.radarDimensions ?? q.radar_dimensions ?? [];
    const kpCode = q.kpCode ?? q.kp_code ?? 'KP-unknown';
    // 优先使用数据库中的kp_name字段，然后使用映射表，最后使用kpCode
    const kpName = q.kpName ?? q.kp_name ?? KP_NAME_MAP[kpCode] ?? kpCode;

    // fallback: 如果radarDimensions为空，使用literacyCodes生成
    let finalRadarDims = Array.isArray(radarDims) ? radarDims : [];
    if (finalRadarDims.length === 0 && Array.isArray(literacyCodes) && literacyCodes.length > 0) {
      finalRadarDims = literacyCodes.map((code: string) => ({
        dimension: code,
        weight: 1,
      }));
    }

    return {
      question_id: questionId,
      q_type: q.qType ?? q.q_type,
      score: q.score ?? 0,
      kp_code: kpCode,
      literacy_codes: Array.isArray(literacyCodes) ? literacyCodes : [],
      radar_dimensions: finalRadarDims,
      knowledge_points: {
        primary: { code: kpCode, name: kpName },
        secondary: null,
      },
    };
  });

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
