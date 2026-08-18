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
import { getTokenStats, resetTokenStats } from './llmClient';

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

  // 重置Token统计（本次提交）
  resetTokenStats();
  
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

  // 知识点名称映射表（从三个题库种子文件提取，覆盖初一/初二/初三所有知识点）
  // 与 app/report/page.tsx 的 KP_NAME_MAP 保持一致
  const KP_NAME_MAP: Record<string, string> = {
    // ===== 小升初衔接（S1 前置知识） =====
    'KP-P.1': '分数运算',
    'KP-P.2': '一元一次方程解法',
    'KP-P.3': '角与度分秒',
    'KP-P.4': '四则混合运算',
    'KP-P.5': '比例与比例尺',
    'KP-P.6': '正比例函数',
    'KP-P.7': '反比例函数',

    // ===== 初一上（S1 身份） =====
    'KP-01.1': '正负数意义',
    'KP-01.2': '数轴',
    'KP-01.3': '绝对值与相反数',
    'KP-01.4': '有理数比较',
    'KP-01.5': '有理数加法',
    'KP-01.6': '有理数减法',
    'KP-01.8': '有理数乘法',
    'KP-01.9': '有理数除法',
    'KP-01.10': '有理数乘方',
    'KP-01.11': '有理数混合运算',
    'KP-01.01': '正负数与有理数概念',
    'KP-01.02': '数轴与绝对值',

    // ===== 初一下（S1 身份） =====
    'KP-03.1': '代数式概念',
    'KP-03.2': '列代数式',
    'KP-03.01': '代数式与整式概念',
    'KP-03.02': '代入求值与整式运算',
    'KP-04.1': '单项式',
    'KP-04.2': '同类项',
    'KP-04.01': '一元一次方程',
    'KP-04.02': '一元一次不等式',
    'KP-04.03': '含参方程与不等式',
    'KP-05.1': '等式性质',

    // ===== 初二（S3-01 身份） =====
    'KP-06.01': '二元一次方程组概念',
    'KP-06.02': '代入消元法',
    'KP-06.03': '加减消元法',
    'KP-06.04': '方程组应用',
    'KP-06.05': '方程组整数解',
    'KP-07.01': '不等式概念',
    'KP-07.02': '不等式解法',
    'KP-07.03': '不等式组',
    'KP-07.04': '不等式应用',
    'KP-07.05': '含参不等式组',
    'KP-07.06': '不等式组整数解',
    'KP-07.07': '不等式与角平分线综合',
    'KP-08.01': '变量与函数',
    'KP-08.02': '一次函数',
    'KP-08.03': '函数图象',
    'KP-08.04': '函数性质',
    'KP-09.01': '整式乘法',
    'KP-09.02': '乘法公式',
    'KP-09.03': '因式分解',
    'KP-09.04': '因式分解综合技巧',
    'KP-09.05': '因式分解应用',
    'KP-09.06': '十字相乘法',
    'KP-10.01': '分式概念',
    'KP-10.02': '分式运算',
    'KP-10.03': '分式方程',
    'KP-10.04': '分式化简求值',
    'KP-10.05': '三角形角度计算综合',
    'KP-11.01': '平行线判定',
    'KP-11.02': '平行线性质',
    'KP-11.03': '平行线综合应用',
    'KP-11.04': '含参不等式组',
    'KP-12.01': '全等三角形判定',
    'KP-12.02': '全等三角形性质',
    'KP-12.03': '角平分线与全等',
    'KP-12.04': '全等三角形证明',
    'KP-13.01': '三角形基本概念',
    'KP-13.02': '三角形边角关系',
    'KP-13.03': '全等三角形综合证明',
    'KP-13.04': '全等三角形判定与性质综合',
    'KP-14.01': '三角形三边关系',
    'KP-14.02': '三角形中线与高',
    'KP-14.03': '三角形内角与外角',
    'KP-14.04': '多边形内角和',

    // ===== 初三（S6-01 身份）—— 全量覆盖所有知识点 =====
    'KP-23.01': '一元二次方程解法',
    'KP-23.02': '韦达定理与判别式',
    'KP-23.03': '一元二次方程应用',
    'KP-23.1': '一元二次方程解法',
    'KP-23.2': '韦达定理与判别式',
    'KP-23.3': '一元二次方程应用',
    'KP-24.01': '圆的性质',
    'KP-24.02': '切线',
    'KP-24.03': '圆与圆位置关系',
    'KP-24.04': '弧长与扇形',
    'KP-24.05': '圆柱与圆锥',
    'KP-24.06': '圆的综合应用',
    'KP-24.07': '圆与相似三角形',
    'KP-24.1': '圆的性质',
    'KP-24.2': '切线',
    'KP-24.3': '圆与圆位置关系',
    'KP-24.4': '弧长与扇形',
    'KP-24.5': '圆柱与圆锥',
    'KP-24.6': '圆的综合应用',
    'KP-24.7': '圆与相似三角形',
    'KP-25.01': '概率概念',
    'KP-25.02': '概率计算',
    'KP-25.1': '概率概念',
    'KP-25.2': '概率计算',
    'KP-26.01': '二次函数图象',
    'KP-26.02': '二次函数性质',
    'KP-26.1': '二次函数图象',
    'KP-26.2': '二次函数性质',
    'KP-27.01': '反比例函数',
    'KP-27.1': '反比例函数',
    'KP-28.01': '概率初步',
    'KP-28.02': '用列举法求概率',
    'KP-28.03': '用频率估计概率',
    'KP-28.04': '概率的应用',
    'KP-28.05': '随机事件',
    'KP-28.06': '几何概型',
    'KP-28.1': '概率初步',
    'KP-28.2': '用列举法求概率',
    'KP-28.3': '用频率估计概率',
    'KP-28.4': '概率的应用',
    'KP-28.5': '随机事件',
    'KP-28.6': '几何概型',
    'KP-29.01': '相似三角形判定',
    'KP-29.02': '相似三角形性质与应用',
    'KP-29.03': '相似三角形综合',
    'KP-29.04': '位似',
    'KP-29.1': '相似三角形判定',
    'KP-29.2': '相似三角形性质与应用',
    'KP-29.3': '相似三角形综合',
    'KP-29.4': '位似',
    'KP-30.01': '锐角三角函数',
    'KP-30.1': '锐角三角函数',
    'KP-31.01': '投影与视图',
    'KP-31.02': '投影与视图应用',
    'KP-31.1': '投影与视图',
    'KP-31.2': '投影与视图应用',
    'KP-32.01': '二次函数综合',
    'KP-32.02': '二次函数与几何综合',
    'KP-32.1': '二次函数综合',
    'KP-32.2': '二次函数与几何综合',
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

  // ===== Token成本统计 =====
  const tokenStats = getTokenStats();
  console.log(`[Pipeline] 本次提交LLM调用统计:`);
  console.log(`  调用次数: ${tokenStats.callCount}`);
  console.log(`  输入Token: ${tokenStats.inputTokens.toLocaleString()}`);
  console.log(`  输出Token: ${tokenStats.outputTokens.toLocaleString()}`);
  console.log(`  总Token: ${tokenStats.totalTokens.toLocaleString()}`);
  console.log(`  预估费用: $${tokenStats.estimatedCost.toFixed(4)} (约¥${(tokenStats.estimatedCost * 7.2).toFixed(3)})`);

  return {
    summary_table: summaryTable,
    grading_results: gradingResults,
    report_material: reportMaterial,
    generated_report: generatedReport,
    is_invalid: isInvalid,
  };
}
