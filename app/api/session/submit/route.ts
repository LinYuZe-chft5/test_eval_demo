/**
 * app/api/session/submit/route.ts
 * POST /api/session/submit —— 提交诊断会话
 *
 * 输入: { session_id, answers: [{ question_id, answer, answer_events, self_mark? }] }
 * 逻辑:
 *   1. 判分（domain/engine/grading）
 *   2. 行为分析（domain/engine/behavior）
 *   3. 二次探测判断（domain/engine/probe）
 *   4. 存储 records
 *   5. 若三天全部完成，执行五层流水线生成报告（domain/engine/pipeline）
 * 输出: { session_id, score, probe_questions?, all_done?, student_id? }
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getSession,
  getCompletedSessions,
} from '@/lib/auth';
import {
  gradeChoice,
  getChoiceEcCode,
  gradeFill,
  gradeSteps,
  type AnswerSpec,
  type StepDef,
  type StepAnswer,
} from '@/domain/engine/grading';
import { analyzeBehavior, assignBehaviorTag } from '@/domain/engine/behavior';
import {
  shouldProbe,
  selectProbeQuestion,
} from '@/domain/engine/probe';
import { runPipeline } from '@/domain/engine/pipeline';
import { LITERACY_DEFINITIONS } from '@/domain/engine/ecDefinitions';
import type { MasteryLevel } from '@/domain/engine/mastery';

interface SubmitAnswer {
  question_id: string;
  answer: string | Record<number, string> | null;
  answer_events: any[];
  self_mark?: string | null;
}

interface GradedRecord {
  question_id: string;
  is_correct: boolean;
  score: number;
  invalid_input: boolean;
  time_spent_ms: number;
  modify_count: number;
  behavior_tag: string | null;
  ec_code: string | null;
  probe_result: string | null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = body?.session_id;
    const answers: SubmitAnswer[] = Array.isArray(body?.answers) ? body.answers : [];

    console.log('[submit] 收到请求:', { sessionId, answersCount: answers.length });

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { ok: false, error: '缺少 session_id' },
        { status: 400 },
      );
    }

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: '会话不存在' },
        { status: 404 },
      );
    }
    if (session.status === 'submitted') {
      return NextResponse.json(
        { ok: false, error: '该会话已提交' },
        { status: 409 },
      );
    }

    const numericSessionId = Number(sessionId);
    const numericStudentId = Number(session.studentId);

    // 取本次会话题目
    const qRows: any[] = await (prisma as any).questions.findMany({
      where: { skuCode: session.skuCode, dayTag: session.dayTag, status: 'active' },
      orderBy: { seqNo: 'asc' },
    });
    const qMap = new Map<string, any>(qRows.map((q) => [String(q.id), q]));

    const graded: GradedRecord[] = [];
    const probeQuestions: any[] = [];
    let sessionProbeCount = 0;
    const sessionQuestionIds = qRows.map((q) => String(q.id));

    // 全部题目（用于探测题选择，覆盖同 SKU 全部 active 题）
    const allQRows: any[] = await (prisma as any).questions.findMany({
      where: { skuCode: session.skuCode, status: 'active' },
    });

    for (const ans of answers) {
      const q = qMap.get(String(ans.question_id));
      if (!q) continue;

      const expectedTimeSec = q.expectedTimeSec ?? 60;
      const events = Array.isArray(ans.answer_events) ? ans.answer_events : [];
      const selfMark = ans.self_mark ?? null;

      // 行为分析
      const behavior = analyzeBehavior(events, expectedTimeSec);

      // 判分 + 错因
      let isCorrect = false;
      let score = 0;
      let invalidInput = false;
      let ecCode: string | null = null;

      if (q.qType === 'choice') {
        const opts = Array.isArray(q.options) ? q.options : [];
        const studentKey = (ans.answer as string) ?? '';
        isCorrect = gradeChoice(studentKey, q.correctAnswer ?? '');
        score = isCorrect ? (q.score ?? 0) : 0;
        if (!isCorrect) {
          ecCode = getChoiceEcCode(studentKey, opts);
        }
      } else if (q.qType === 'fill') {
        const spec = (q.answerSpec ?? undefined) as AnswerSpec | undefined;
        const r = gradeFill(
          (ans.answer as string) ?? '',
          q.correctAnswer ?? '',
          spec ?? { accept_forms: ['decimal'] },
        );
        isCorrect = r.is_correct;
        invalidInput = r.invalid_input;
        score = isCorrect ? (q.score ?? 0) : 0;
        if (!isCorrect) {
          const ecMap: string[] = Array.isArray(q.ecMapping) ? q.ecMapping : [];
          ecCode = ecMap[0] ?? null;
        }
      } else if (q.qType === 'step') {
        const stepDefs = (Array.isArray(q.steps) ? q.steps : []) as StepDef[];
        const stepAnswerMap = (ans.answer ?? {}) as Record<number, string>;
        const stepAnswers: StepAnswer[] = Object.entries(stepAnswerMap).map(
          ([seq, val]) => ({ seq: Number(seq), answer: val }),
        );
        const r = gradeSteps(stepAnswers, stepDefs);
        const maxScore = stepDefs.reduce((s, d) => s + (d.score ?? 0), 0);
        score = r.total_score;
        isCorrect = maxScore > 0 && r.total_score >= maxScore;
        if (!isCorrect) {
          const firstWrong = r.step_results.find((sr) => !sr.is_correct);
          if (firstWrong) {
            const def = stepDefs.find((d) => d.seq === firstWrong.seq);
            const stepEc: string[] =
              (def as any)?.ec_mapping ?? [];
            ecCode = stepEc[0] ?? null;
          }
          if (!ecCode) {
            const ecMap: string[] = Array.isArray(q.ecMapping) ? q.ecMapping : [];
            ecCode = ecMap[0] ?? null;
          }
        }
      }

      // 行为标签
      const tag = assignBehaviorTag(behavior, isCorrect, expectedTimeSec);

      const record: GradedRecord = {
        question_id: String(q.id),
        is_correct: isCorrect,
        score,
        invalid_input: invalidInput,
        time_spent_ms: behavior.time_spent_ms,
        modify_count: behavior.modify_count,
        behavior_tag: tag.behavior_tag,
        ec_code: ecCode,
        probe_result: null,
      };
      graded.push(record);

      // 二次探测
      const probeQ = {
        id: String(q.id),
        expected_time_sec: expectedTimeSec,
        parallel_group_id: q.parallelGroupId ?? null,
        kp_code: q.kpCode ?? null,
        difficulty_est: q.difficultyEst ?? 0,
        variant_of: q.variantOf != null ? String(q.variantOf) : null,
        status: q.status ?? 'active',
        is_anchor: !!q.isAnchor,
      };
      if (
        shouldProbe(
          {
            question_id: record.question_id,
            is_correct: record.is_correct,
            time_spent_ms: record.time_spent_ms,
            self_mark: selfMark,
            behavior_tag: record.behavior_tag,
            invalid_input: record.invalid_input,
          },
          probeQ,
          sessionProbeCount,
        )
      ) {
        const candidates: any[] = allQRows.map((qq) => ({
          id: String(qq.id),
          expected_time_sec: qq.expectedTimeSec ?? 60,
          parallel_group_id: qq.parallelGroupId ?? null,
          kp_code: qq.kpCode ?? null,
          difficulty_est: qq.difficultyEst ?? 0,
          variant_of: qq.variantOf != null ? String(qq.variantOf) : null,
          status: qq.status ?? 'active',
          is_anchor: !!qq.isAnchor,
        }));
        const picked = selectProbeQuestion(
          {
            question_id: record.question_id,
            is_correct: record.is_correct,
            time_spent_ms: record.time_spent_ms,
            self_mark: selfMark,
          },
          probeQ,
          candidates,
          sessionQuestionIds,
        );
        if (picked) {
          sessionProbeCount += 1;
          const full = allQRows.find((qq) => String(qq.id) === picked.id);
          if (full) {
            probeQuestions.push({
              id: String(full.id),
              q_type: full.qType,
              stem: full.stem ?? '',
              options: Array.isArray(full.options)
                ? full.options.map((o: any) => ({ key: o.key, text: o.text }))
                : null,
              steps: Array.isArray(full.steps)
                ? full.steps.map((s: any) => ({ seq: s.seq, prompt: s.prompt }))
                : null,
              score: full.score ?? 0,
              for_question_id: record.question_id,
            });
          }
        }
      }

      // 存储作答记录
      // 注意：behavior_tag 是 VARCHAR(32)[] 数组字段，需包装为数组
      //       ec_recommended / ec_final 也是 VARCHAR(8)[] 数组字段
      try {
        await (prisma as any).records.create({
          data: {
            sessionId: numericSessionId,
            studentId: numericStudentId,
            questionId: Number(record.question_id),
            stepSeq: 1,
            studentAnswer: ans.answer ?? null,
            isCorrect: record.is_correct,
            scoreObtained: record.score ?? 0,
            timeSpentMs: record.time_spent_ms ?? 0,
            modifyCount: record.modify_count ?? 0,
            deleteRewriteCount: 0,
            behaviorTag: record.behavior_tag ? [record.behavior_tag] : null,
            ecCode: ecCode ? [ecCode] : null,
            ecFinal: ecCode ? [ecCode] : null,
            selfMark: selfMark,
            answerEvents: events,
            invalidInput: record.invalid_input ?? false,
            probeResult: record.probe_result,
          },
        });
      } catch (e: any) {
        const safeData: any = {
          sessionId: numericSessionId,
          studentId: numericStudentId,
          questionId: Number(record.question_id),
          stepSeq: 1,
          studentAnswer: ans.answer ?? null,
          isCorrect: record.is_correct,
          scoreObtained: record.score ?? 0,
          timeSpentMs: record.time_spent_ms ?? 0,
          modifyCount: record.modify_count ?? 0,
          deleteRewriteCount: 0,
          invalidInput: record.invalid_input ?? false,
        };
        await (prisma as any).records.create({ data: safeData });
      }
    }

    const totalScore = graded.reduce((s, r) => s + r.score, 0);
    await (prisma as any).sessions.update({
      where: { id: numericSessionId },
      data: { status: 'submitted', submittedAt: new Date() },
    });

    // 判断三天是否全部完成
    const student = await (prisma as any).students.findUnique({
      where: { id: numericStudentId },
    });
    const accessCode = student ? (await (prisma as any).accessCodes.findUnique({
      where: { id: student.accessCodeId },
    })) : null;
    const accessCodeStr = accessCode?.code ?? '';

    const completed = await getCompletedSessions(accessCodeStr);
    const completedDays = new Set(
      (completed ?? []).map((s: any) => Number(s.dayTag)),
    );
    const allDone = [1, 2, 3].every((d) => completedDays.has(d));

    let studentId: string | undefined = String(session.studentId);

    if (allDone) {
      try {
        await generateReport(accessCodeStr, session.skuCode, completed);
      } catch (err) {
        console.error('[session/submit] report generation failed:', err);
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        session_id: sessionId,
        score: totalScore,
        probe_questions: probeQuestions.length ? probeQuestions : undefined,
        all_done: allDone,
        student_id: studentId,
      },
    });
  } catch (err) {
    console.error('[session/submit] error:', err);
    return NextResponse.json(
      { ok: false, error: '服务器错误' },
      { status: 500 },
    );
  }
}

// ===== 报告生成（五层流水线） =====
async function generateReport(
  accessCode: string,
  skuCode: string,
  completedSessions: any[],
) {
  const sessionIds = completedSessions.map((s) => s.id);

  const accessCodeRecord = await (prisma as any).accessCodes.findUnique({
    where: { code: accessCode.trim().toUpperCase() },
  });
  if (!accessCodeRecord) {
    throw new Error(`Access code not found: ${accessCode}`);
  }
  const accessCodeId = accessCodeRecord.id;

  let student = await (prisma as any).students.findUnique({
    where: { accessCodeId: accessCodeId },
  });
  if (!student) {
    student = await (prisma as any).students.create({
      data: {
        accessCodeId: accessCodeId,
        skuCode: skuCode,
        nickname: '学生',
        grade: '七年级',
      },
    });
  }
  const bigintId = typeof student.id === 'string' ? BigInt(student.id) : Number(student.id);

  const gradeMap: Record<string, string> = {
    'S1_XIAOSHENGCHU_MATH': '初一', 'S1': '初一',
    'S3-01': '初二', 'S3': '初二',
    'S6-01': '初三', 'S6': '初三',
  };
  const gradeLabel = gradeMap[skuCode] || '初一';
  const skuLabelMap: Record<string, string> = {
    'S1_XIAOSHENGCHU_MATH': '小升初诊断',
    'S3-01': '七升八诊断',
    'S6-01': '中考一轮诊断',
  };
  const skuLabel = skuLabelMap[skuCode] || '数学诊断';

  // 全部作答记录
  const recordRows: any[] = await (prisma as any).records.findMany({
    where: { sessionId: { in: sessionIds } },
  });

  // 全部题目（三天，含五层流水线元数据）
  const qRows: any[] = await (prisma as any).questions.findMany({
    where: { skuCode, dayTag: { in: [1, 2, 3] }, status: 'active' },
  });

  // 构建学生答案映射
  const studentAnswers: Record<string, any> = {};
  const behaviorData: Record<string, { time_spent_ms: number; modify_count: number; behavior_tag?: string }> = {};

  for (const q of qRows) {
    const questionId = `${q.skuCode}-D${q.dayTag}-Q${String(q.seqNo).padStart(2, '0')}`;
    const qId = String(q.id);
    const records = recordRows.filter((r: any) => {
      const rid = String(r.questionId ?? r.question_id);
      return rid === qId;
    });

    if (records.length === 0) {
      studentAnswers[questionId] = null;
      behaviorData[questionId] = { time_spent_ms: 0, modify_count: 0 };
      continue;
    }

    if (q.qType === 'step') {
      const stepAnswers: Array<{ seq: number; answer: string }> = [];
      for (const r of records) {
        const ans = r.studentAnswer ?? r.student_answer;
        const seq = r.stepSeq ?? r.step_seq ?? 1;
        if (ans !== null && ans !== undefined) {
          stepAnswers.push({ seq: Number(seq), answer: String(ans) });
        }
      }
      studentAnswers[questionId] = stepAnswers.length > 0 ? stepAnswers : null;
      const totalTime = records.reduce((sum: number, r: any) => sum + (r.timeSpentMs ?? r.time_spent_ms ?? 0), 0);
      const totalModify = records.reduce((sum: number, r: any) => sum + (r.modifyCount ?? r.modify_count ?? 0), 0);
      const behaviorTags = records.flatMap((r: any) => Array.isArray(r.behaviorTag) ? r.behaviorTag : (r.behavior_tag ? [r.behavior_tag] : []));
      behaviorData[questionId] = { time_spent_ms: totalTime, modify_count: totalModify, behavior_tag: behaviorTags[0] };
    } else {
      const r = records[0];
      const ans = r.studentAnswer ?? r.student_answer;
      studentAnswers[questionId] = ans !== null && ans !== undefined ? String(ans) : null;
      behaviorData[questionId] = {
        time_spent_ms: r.timeSpentMs ?? r.time_spent_ms ?? 0,
        modify_count: r.modifyCount ?? r.modify_count ?? 0,
        behavior_tag: Array.isArray(r.behaviorTag) ? r.behaviorTag[0] : (r.behaviorTag ?? r.behavior_tag ?? undefined),
      };
    }
  }

  // DEBUG: 打印前3个题目的数据映射，便于排查
  const sampleKeys = Object.keys(studentAnswers).slice(0, 3);
  for (const k of sampleKeys) {
    const ans = studentAnswers[k];
    const beh = behaviorData[k];
    const ansStr = ans === null ? 'null' : (typeof ans === 'string' ? ans.slice(0, 40) : JSON.stringify(ans).slice(0, 40));
    console.log(`[Pipeline Debug] ${k}: answer=${ansStr}, time=${beh?.time_spent_ms}ms, modify=${beh?.modify_count}`);
  }
  const nonNullAnswers = Object.values(studentAnswers).filter(v => v !== null && v !== undefined && v !== '').length;
  console.log(`[Pipeline Debug] 非空答案: ${nonNullAnswers}/${Object.keys(studentAnswers).length}`);

  // ===== 执行五层流水线 =====
  const pipelineResult = await runPipeline({
    questions: qRows,
    studentAnswers,
    behaviorData,
    reportMeta: {
      student_name: student.nickname || '学生',
      grade: gradeLabel,
      test_date: new Date().toISOString().split('T')[0],
      sku_code: skuCode,
      sku_label: skuLabel,
    },
  });

  function generateViewToken(): string {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const bytes = new Uint8Array(21);
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 21; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let result = '';
    for (let i = 0; i < bytes.length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }
  const viewToken = generateViewToken();

  // ===== 映射流水线输出到数据库字段 =====
  const { summary_table, generated_report, is_invalid } = pipelineResult;

  // 🔴 关键日志：Pipeline 结果概览
  console.log('[submit] Pipeline结果:', {
    is_invalid,
    genuine_answers: summary_table.genuine_response_stats?.genuine_answers,
    total_questions: summary_table.genuine_response_stats?.total_questions,
    error_frequency_by_kp_count: summary_table.error_frequency_by_kp?.length,
    has_generated_report: !!generated_report,
    generation_method: generated_report?.generation_method,
    four_week_plan_length: generated_report?.four_week_plan?.length,
    has_action_checklist: !!generated_report?.action_checklist,
    action_checklist_length: generated_report?.action_checklist?.length,
  });

  // 报告页期望的 literacyRadar 格式: { [dimension]: { score, level, question_count, valid } }
  // 使用素养维度中文名称作为键（如 "运算能力" 而不是 "YS-02"）
  const literacyRadar: Record<string, { score: number; level: string; question_count: number; valid: boolean }> = {};
  for (const [dim, data] of Object.entries(summary_table.radar_chart)) {
    // 将素养维度编码转换为中文名称
    const dimName = LITERACY_DEFINITIONS[dim]?.name || dim;
    literacyRadar[dimName] = {
      score: (data as any).score,
      level: (data as any).level,
      question_count: (data as any).question_count,
      valid: (data as any).valid,
    };
  }

  // 页面期望的 ModuleMastery 格式: { [kp_code]: { mastery_score, level, error_rate, error_count, total_count, kp_name } }
  // 从 error_frequency_by_kp 生成（这是最全面的知识点数据）
  const moduleMastery: Record<string, { mastery_score: number; level: MasteryLevel; error_rate: number; error_count: number; total_count: number; kp_name: string }> = {};
  for (const kp of summary_table.error_frequency_by_kp) {
    const errorRate = Number(kp.error_rate ?? 0);
    const masteryScore = Math.max(0, 1 - errorRate);
    let level: MasteryLevel = 'yellow';
    if (masteryScore >= 0.8) level = 'green';
    else if (masteryScore >= 0.5) level = 'yellow';
    else level = 'red';
    moduleMastery[kp.kp_code] = {
      mastery_score: Number.isFinite(masteryScore) ? masteryScore : 0,
      level,
      error_rate: Math.round(errorRate * 100),
      error_count: kp.error_count,
      total_count: kp.total_count,
      kp_name: kp.kp_name,
    };
  }

  // 如果模块掌握度为空（可能因为所有知识点掌握度都>=50%），添加一个"待加强"状态的记录
  // 确保报告页有内容可显示
  if (Object.keys(moduleMastery).length === 0 && summary_table.error_frequency_by_kp.length > 0) {
    // 取错误率最高的前3个知识点，强制显示
    const topKps = [...summary_table.error_frequency_by_kp].sort((a, b) => b.error_rate - a.error_rate).slice(0, 3);
    for (const kp of topKps) {
      const errorRate = Number(kp.error_rate ?? 0);
      const masteryScore = Math.max(0, 1 - errorRate);
      let level: MasteryLevel = 'yellow';
      if (masteryScore >= 0.8) level = 'green';
      else if (masteryScore >= 0.5) level = 'yellow';
      else level = 'red';
      moduleMastery[kp.kp_code] = {
        mastery_score: Number.isFinite(masteryScore) ? masteryScore : 0,
        level,
        error_rate: Math.round(errorRate * 100),
        error_count: kp.error_count,
        total_count: kp.total_count,
        kp_name: kp.kp_name,
      };
    }
  }

  const topLabel = summary_table.error_frequency_by_label[0] || null;
  const ecSecondary = summary_table.error_frequency_by_label[1] || null;
  const ecDistribution: Record<string, { count: number; percentage: number }> = {};
  for (const entry of summary_table.error_frequency_by_label) {
    ecDistribution[entry.code] = { count: entry.count, percentage: entry.percentage };
  }
  const ecProfile = {
    primary: topLabel?.code ?? null,
    secondary: ecSecondary?.code ?? null,
    distribution: ecDistribution,
    low_confidence_notes: [] as string[],
  };

  // ===== 格式转换层：将LLM输出转换为前端期望的格式 =====
  // 增加智能解析和容错机制，处理LLM可能返回的各种格式

  // 智能提取知识点名称列表
  function extractKpList(obj: any): string[] {
    const candidates = [
      obj?.focus_kps,
      obj?.focus_kp, 
      obj?.focus_kps_list,
      obj?.focus_points,
      obj?.focus_knowledge_points,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        return candidate.filter((x: any) => typeof x === 'string' && x.trim());
      }
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.split(/[,，、;；]/).map(s => s.trim()).filter(Boolean);
      }
    }
    return [];
  }

  // 智能提取训练内容列表
  function extractContentList(obj: any): string[] {
    // 尝试多种可能的字段名
    const exercises = obj?.exercises || obj?.daily_tasks || obj?.tasks || obj?.content_list;
    if (Array.isArray(exercises) && exercises.length > 0) {
      return exercises.map((e: any) => {
        if (typeof e === 'string') return e.trim();
        if (e?.content) {
          let text = e.content.trim();
          if (e?.reason && !e.reason.includes('理由')) {
            text += `（理由：${e.reason}）`;
          }
          return text;
        }
        if (e?.title) return e.title.trim();
        if (typeof e === 'object') {
          // 尝试从对象中提取第一个字符串值
          const values = Object.values(e).filter((v: any) => typeof v === 'string' && v.trim());
          return values[0]?.trim() || '';
        }
        return '';
      }).filter(Boolean);
    }
    
    // 直接使用 weekly_content 或 content
    const directContent = obj?.weekly_content || obj?.weekly_plan || obj?.content;
    if (Array.isArray(directContent) && directContent.length > 0) {
      return directContent.map((c: any) => typeof c === 'string' ? c.trim() : String(c).trim()).filter(Boolean);
    }
    if (typeof directContent === 'string' && directContent.trim()) {
      return directContent.split(/[;；\n]/).map(s => s.trim()).filter(Boolean);
    }
    
    return [];
  }

  // 智能提取练习量
  function extractPracticeCount(obj: any): number {
    const candidates = [obj?.practice_count, obj?.daily_count, obj?.exercise_count, obj?.questions_per_day];
    for (const c of candidates) {
      const num = Number(c);
      if (!isNaN(num) && num > 0) return num;
    }
    return 5;
  }

  // 智能提取周数
  function extractWeekNum(obj: any, idx: number): number {
    const num = Number(obj?.week ?? obj?.week_num ?? obj?.week_number);
    if (!isNaN(num) && num > 0) return num;
    return idx + 1;
  }

  // 4周计划格式转换
  // LLM格式可能: { week, focus_kp: string|string[], exercises: [{ content, reason }] }
  // 前端格式: { week, focus_kps: string[], weekly_content: string[], practice_count }
  let plan4week = generated_report.four_week_plan;
  console.log('[session/submit] LLM原始4周计划:', {
    length: plan4week?.length || 0,
    firstItem: plan4week?.[0] ? Object.keys(plan4week[0]) : [],
  });

  if (plan4week && plan4week.length > 0) {
    plan4week = plan4week.map((w: any, idx: number) => {
      // 智能提取焦点知识点
      const focusKps = extractKpList(w);
      
      // 智能提取训练内容
      const weeklyContent = extractContentList(w);
      
      // 智能提取周数和练习量
      const weekNum = extractWeekNum(w, idx);
      const practiceCount = extractPracticeCount(w);

      const result = {
        week: weekNum,
        focus_kps: focusKps,
        weekly_content: weeklyContent,
        practice_count: practiceCount,
      };

      console.log(`[session/submit] 第${weekNum}周转换结果:`, {
        focus_kps: result.focus_kps.length,
        weekly_content: result.weekly_content.length,
        practice_count: result.practice_count,
      });

      return result;
    });
    console.log('[session/submit] 4周计划格式转换完成:', plan4week.length, '周');
  } else {
    console.warn('[session/submit] LLM未生成4周计划，将使用降级方案');
  }

  // 行动清单格式转换
  // LLM格式可能: { kp_code, name, severity: '高'|'中'|'低', action }
  // 前端格式: { kp_code, name, action, level: 'red'|'yellow'|'green' }
  console.log('[session/submit] LLM原始action_checklist:', {
    length: generated_report.action_checklist?.length || 0,
    firstItem: generated_report.action_checklist?.[0] ? Object.keys(generated_report.action_checklist[0]) : [],
  });

  // 智能提取行动清单条目
  function extractActionItem(item: any, fallbackKpCode?: string, fallbackName?: string): {
    kp_code: string;
    name: string;
    level: 'red' | 'yellow' | 'green';
    action: string;
  } | null {
    if (!item || typeof item !== 'object') return null;

    // 智能提取知识点代码
    const kpCode = item.kp_code || item.kpCode || item.code || item.kp || fallbackKpCode || '';
    
    // 智能提取知识点名称
    const name = item.name || item.kp_name || item.kpName || item.knowledge_point || fallbackName || kpCode;
    
    // 智能提取严重程度并映射为level
    let level: 'red' | 'yellow' | 'green' = 'yellow';
    const severity = String(item.severity || item.level || item.severity_level || '').toLowerCase();
    if (severity === '高' || severity === 'high' || severity === 'severe' || severity === 'red' || severity === '严重') {
      level = 'red';
    } else if (severity === '中' || severity === 'medium' || severity === 'moderate' || severity === 'yellow' || severity === '中等') {
      level = 'yellow';
    } else if (severity === '低' || severity === 'low' || severity === 'green' || severity === '轻微') {
      level = 'green';
    }

    // 智能提取行动建议
    let action = item.action || item.suggestion || item.tip || item.recommendation || '';
    if (!action || typeof action !== 'string' || !action.trim()) {
      // 根据level生成默认行动建议
      if (level === 'red') {
        action = `重点补强${name}，建议每天做8-10道基础变式题，从教材例题开始，确保概念准确无误`;
      } else if (level === 'yellow') {
        action = `巩固${name}，建议每天做5-8道练习题，重点关注错题重做和变式训练`;
      } else {
        action = `保持${name}的良好状态，建议每天做3-5道综合题，提升知识迁移能力`;
      }
    }

    return {
      kp_code: kpCode,
      name: name,
      level: level,
      action: action.trim(),
    };
  }

  let actionChecklist: Array<{ kp_code: string; name: string; level: 'red' | 'yellow' | 'green'; action: string }> = [];
  
  // 1. 优先使用LLM生成的action_checklist（带智能解析）
  if (generated_report.action_checklist && Array.isArray(generated_report.action_checklist) && generated_report.action_checklist.length > 0) {
    console.log('[session/submit] 使用LLM生成的action_checklist:', generated_report.action_checklist.length, '条');
    actionChecklist = generated_report.action_checklist
      .map((item: any) => extractActionItem(item))
      .filter((item): item is NonNullable<typeof item> => item !== null);
    
    console.log('[session/submit] LLM action_checklist转换结果:', actionChecklist.length, '条');
  }
  
  // 2. 降级：使用薄弱知识点（如果LLM没有生成或生成失败）
  if (actionChecklist.length === 0 && summary_table.weak_knowledge_points.length > 0) {
    console.log('[session/submit] 使用降级方案：薄弱知识点生成action_checklist');
    actionChecklist = summary_table.weak_knowledge_points.map((kp: any) => {
      const errorRate = Math.round((kp.error_rate || 0) * 100);
      const level = kp.error_rate >= 0.75 ? 'red' as const : kp.error_rate >= 0.5 ? 'yellow' as const : 'green' as const;
      const dailyCount = level === 'red' ? 8 : level === 'yellow' ? 6 : 4;
      
      return {
        kp_code: kp.kp_code || kp.kpCode || '',
        name: kp.name || kp.kp_name || kp.kpCode || '',
        level: level,
        action: `针对${kp.name || '该知识点'}进行专项训练（错误率${errorRate}%），建议每天做${dailyCount}道变式练习题，重点关注错题重做和概念巩固`,
      };
    });
  }

  // 3. 再次降级：如果仍然为空，使用错误频次最高的前5个知识点
  if (actionChecklist.length === 0 && summary_table.error_frequency_by_kp.length > 0) {
    console.log('[session/submit] 使用最终降级方案：错误频次最高的知识点');
    const topKps = [...summary_table.error_frequency_by_kp].sort((a, b) => b.error_rate - a.error_rate).slice(0, 5);
    actionChecklist = topKps.map((kp: any) => {
      const errorRate = Math.round((kp.error_rate || 0) * 100);
      const level = kp.error_rate >= 0.75 ? 'red' as const : kp.error_rate >= 0.6 ? 'yellow' as const : 'green' as const;
      const dailyCount = Math.max(3, Math.round((kp.error_rate || 0) * 10));
      
      return {
        kp_code: kp.kp_code || '',
        name: kp.kp_name || kp.kp_code || '',
        level: level,
        action: `针对${kp.kp_name || '薄弱知识点'}进行专项训练（错误率${errorRate}%），建议每天做${dailyCount}道变式练习题，从基础概念入手逐步提升`,
      };
    });
  }

  console.log('[session/submit] action_checklist最终结果:', {
    length: actionChecklist.length,
    levels: actionChecklist.reduce((acc: any, item) => {
      acc[item.level] = (acc[item.level] || 0) + 1;
      return acc;
    }, {}),
  });

  const degradedTextsValue = is_invalid ? [{
    type: 'invalid_response',
    text: generated_report.error_analysis,
  }] : null;

  // 🔴 DEBUG: 验证写入数据库的数据结构
  console.log('[session/submit] 准备写入数据库的数据结构:', {
    moduleMastery: {
      type: typeof moduleMastery,
      keys: Object.keys(moduleMastery).slice(0, 3),
      sample: Object.entries(moduleMastery).slice(0, 2).map(([k, v]) => ({
        k,
        vKeys: v ? Object.keys(v) : [],
      })),
    },
    plan4week: {
      length: plan4week.length,
      sample: plan4week[0] ? {
        keys: Object.keys(plan4week[0]),
        focus_kps: plan4week[0].focus_kps,
        weekly_content: plan4week[0].weekly_content,
      } : null,
    },
    actionChecklist: {
      length: actionChecklist.length,
      sample: actionChecklist[0] ? {
        keys: Object.keys(actionChecklist[0]),
        kp_code: actionChecklist[0].kp_code,
        level: actionChecklist[0].level,
      } : null,
    },
  });

  const baseCreateData: any = {
    studentId: bigintId,
    skuCode: skuCode,
    status: 'draft',
    viewToken: viewToken,
    totalScore: summary_table.total_score,
    adaptiveLevel: summary_table.grade_level,
    moduleMastery: moduleMastery,
    literacyRadar: literacyRadar,
    ecProfile: ecProfile,
    confidenceFlags: is_invalid ? ['invalid_response'] : [],
    plan4week: plan4week,
    actionChecklist: actionChecklist,
    degradedTexts: degradedTextsValue,
    degraded_texts: degradedTextsValue,
    narrativeText: generated_report.error_analysis,
  };

  const baseUpdateData: any = { ...baseCreateData, updatedAt: new Date() };
  delete baseUpdateData.viewToken;

  await (prisma as any).reportDrafts.upsert({
    where: { studentId: bigintId, skuCode: skuCode },
    create: baseCreateData,
    update: baseUpdateData,
  });

  console.log('[session/submit] 五层流水线报告生成完成:', {
    total_score: summary_table.total_score,
    grade_level: summary_table.grade_level,
    is_invalid,
    radar_dimensions: Object.keys(summary_table.radar_chart).length,
    weak_kps: summary_table.weak_knowledge_points.length,
    plan_weeks: plan4week.length,
    method: generated_report.generation_method,
  });
}
