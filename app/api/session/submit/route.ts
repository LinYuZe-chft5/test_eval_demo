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
 *   5. 若三天全部完成，生成报告（domain/engine/reportBuilder）
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
import {
  buildReport,
  type ReportRecord,
  type ReportQuestion,
} from '@/domain/engine/reportBuilder';
import type { KpDep, MethodCard } from '@/domain/engine/pathEngine';

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
          // 取第一个错步的 ec_mapping
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
          behaviorTag: record.behavior_tag,
          ecCode: record.ec_code,
          selfMark: selfMark,
          answerEvents: events,
          invalidInput: record.invalid_input ?? false,
          probeResult: record.probe_result,
        },
      });
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

// ===== 报告生成 =====
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

  // 全部作答记录
  const recordRows: any[] = await (prisma as any).records.findMany({
    where: { sessionId: { in: sessionIds } },
  });

  // 全部题目（三天）
  const qRows: any[] = await (prisma as any).questions.findMany({
    where: { skuCode, dayTag: { in: [1, 2, 3] }, status: 'active' },
  });
  const qMap = new Map<string, any>(qRows.map((q) => [String(q.id), q]));

  const records: ReportRecord[] = recordRows.map((r) => {
    const q = qMap.get(String(r.questionId ?? r.question_id));
    return {
      question_id: String(r.questionId ?? r.question_id),
      kp_code: q?.kpCode ?? null,
      module: undefined,
      literacy: Array.isArray(q?.literacyCodes) ? q.literacyCodes[0] : undefined,
      pairing_id: q?.pairingId ?? null,
      is_correct: !!(r.isCorrect ?? r.is_correct),
      score: r.scoreObtained ?? r.score ?? r.score_obtained ?? 0,
      time_spent_ms: r.timeSpentMs ?? 0,
      modify_count: r.modifyCount ?? 0,
      self_mark: r.selfMark ?? null,
      invalid_input: !!(r.invalidInput ?? r.invalid_input),
      behavior_tag: r.behaviorTag ?? null,
      probe_result: r.probeResult ?? null,
      ec_code: r.ecCode ?? null,
    };
  });

  const questions: ReportQuestion[] = qRows.map((q) => ({
    id: String(q.id),
    kp_code: q.kpCode ?? null,
    module: undefined,
    literacy: Array.isArray(q.literacyCodes) ? q.literacyCodes[0] : undefined,
    expected_time_sec: q.expectedTimeSec ?? 60,
    difficulty_est: q.difficultyEst ?? 0,
    parallel_group_id: q.parallelGroupId ?? null,
    variant_of: q.variantOf != null ? String(q.variantOf) : null,
    status: q.status ?? 'active',
    is_anchor: !!q.isAnchor,
    is_warmup: !!q.isWarmup,
  }));

  // 知识点依赖
  const kpRows: any[] = await (prisma as any).kpDependencies.findMany();
  const kpDeps = new Map<string, KpDep>();
  for (const k of kpRows) {
    kpDeps.set(k.kpCode, {
      prerequisite_ids: Array.isArray(k.prerequisiteIds) ? k.prerequisiteIds : [],
    });
  }

  // 方法卡：通过题目 ec_mapping 关联 kp_code
  const ecToKps = new Map<string, Set<string>>();
  for (const q of qRows) {
    const kps = q.kpCode;
    const ecs: string[] = Array.isArray(q.ecMapping) ? q.ecMapping : [];
    for (const ec of ecs) {
      if (!ecToKps.has(ec)) ecToKps.set(ec, new Set());
      if (kps) ecToKps.get(ec)!.add(kps);
    }
  }
  const mcRows: any[] = await (prisma as any).methodCards.findMany();
  const methodCards: MethodCard[] = mcRows.map((m) => ({
    id: m.ecCode,
    kp_codes: ecToKps.has(m.ecCode)
      ? [...(ecToKps.get(m.ecCode) ?? [])]
      : [],
    title: m.methodName ?? m.ecCode,
  }));

  const sessions = completedSessions.map((s) => ({ id: s.id }));

  const draft = buildReport(
    String(bigintId),
    sessions,
    records,
    questions,
    kpDeps,
    methodCards,
  );

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

  const totalScore = draft?.total_score ?? undefined;
  const adaptiveLevel = draft?.adaptive_level ?? undefined;
  const moduleMastery = draft?.module_mastery ?? undefined;
  const literacyRadar = draft?.literacy_radar ?? undefined;
  const ecProfile = draft?.ec_profile ?? undefined;
  const confidenceFlags = draft?.confidence_flags ?? undefined;
  const plan4week = draft?.plan_4week ?? undefined;
  const actionChecklist = draft?.action_checklist ?? undefined;

  const hasStructuredFields = 
    totalScore !== undefined ||
    adaptiveLevel !== undefined ||
    moduleMastery !== undefined ||
    literacyRadar !== undefined ||
    ecProfile !== undefined ||
    confidenceFlags !== undefined ||
    plan4week !== undefined ||
    actionChecklist !== undefined;

  const degradedTexts = hasStructuredFields ? undefined : draft;

  const baseCreateData: any = {
    studentId: bigintId,
    skuCode: skuCode,
    status: 'draft',
    viewToken: viewToken,
  };
  if (totalScore !== undefined) baseCreateData.totalScore = totalScore;
  if (adaptiveLevel !== undefined) baseCreateData.adaptiveLevel = adaptiveLevel;
  if (moduleMastery !== undefined) baseCreateData.moduleMastery = moduleMastery;
  if (literacyRadar !== undefined) baseCreateData.literacyRadar = literacyRadar;
  if (ecProfile !== undefined) baseCreateData.ecProfile = ecProfile;
  if (confidenceFlags !== undefined) baseCreateData.confidenceFlags = confidenceFlags;
  if (plan4week !== undefined) baseCreateData.plan4week = plan4week;
  if (actionChecklist !== undefined) baseCreateData.actionChecklist = actionChecklist;
  if (degradedTexts !== undefined) baseCreateData.degradedTexts = degradedTexts;

  const baseUpdateData: any = { ...baseCreateData, updatedAt: new Date() };
  delete baseUpdateData.viewToken;

  await (prisma as any).reportDrafts.upsert({
    where: { studentId: bigintId, skuCode: skuCode },
    create: baseCreateData,
    update: baseUpdateData,
  });
}
