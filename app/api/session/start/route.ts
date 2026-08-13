/**
 * app/api/session/start/route.ts
 * POST /api/session/start —— 开始诊断会话
 *
 * 输入: { access_code: string, day: 1|2|3 }
 * 逻辑: 创建 session 记录，返回题目列表（按 day_tag 和 seq_no 排序）
 * 输出: { session_id, questions: [...], time_limit_min }
 *
 * 返回给前端的题目已剔除答案等敏感字段。
 */
import { NextResponse } from 'next/server';
import { verifyAccessCode, createSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDayTimeLimitMin } from '@/domain/config/rules';

interface ClientOption {
  key: string;
  text: string;
}
interface ClientStep {
  seq: number;
  prompt: string;
}
interface ClientQuestion {
  id: string;
  q_type: 'choice' | 'fill' | 'step';
  stem: string;
  options: ClientOption[] | null;
  steps: ClientStep[] | null;
  score: number;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = body?.access_code;
    const day = Number(body?.day);

    if (!code || ![1, 2, 3].includes(day)) {
      return NextResponse.json(
        { ok: false, error: '参数错误：需要 access_code 与 day(1|2|3)' },
        { status: 400 },
      );
    }

    const ac = await verifyAccessCode(code);
    if (!ac) {
      return NextResponse.json(
        { ok: false, error: '访问码无效或已过期' },
        { status: 403 },
      );
    }

    const dayTag = day as 1 | 2 | 3;
    const timeLimitMin = getDayTimeLimitMin(dayTag);

    // 创建会话
    const session = await createSession({
      accessCode: ac.code,
      skuCode: ac.skuCode,
      studentId: ac.studentId ?? null,
      dayTag,
      timeLimitMin,
    });

    // 取题（按 seq_no 升序）
    const rows: any[] = await (prisma as any).questions.findMany({
      where: { skuCode: ac.skuCode, dayTag, status: 'active' },
      orderBy: { seqNo: 'asc' },
    });

    const questions: ClientQuestion[] = rows.map((q) => ({
      id: String(q.id ?? ''),
      q_type: q.q_type || q.qType,
      stem: q.stem ?? '',
      options: Array.isArray(q.options)
        ? q.options.map((o: any) => ({ key: o.key, text: o.text }))
        : null,
      steps: Array.isArray(q.steps)
        ? q.steps.map((s: any) => ({ seq: s.seq, prompt: s.prompt }))
        : null,
      score: q.score ?? 0,
    }));

    return NextResponse.json({
      ok: true,
      data: {
        session_id: session.id,
        questions,
        time_limit_min: timeLimitMin,
      },
    });
  } catch (err) {
    console.error('[session/start] error:', err);
    return NextResponse.json(
      { ok: false, error: '服务器错误' },
      { status: 500 },
    );
  }
}
