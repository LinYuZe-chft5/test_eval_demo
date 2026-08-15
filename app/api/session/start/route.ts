/**
 * app/api/session/start/route.ts
 * POST /api/session/start —— 开始诊断会话
 *
 * 输入: { identity: 'grade7'|'grade8'|'grade9', access_code: string, day: 1|2|3 }
 * 逻辑:
 *   1. 验证身份和访问码
 *   2. 创建 session 记录，返回对应身份的题目列表
 * 输出: { session_id, questions: [...], time_limit_min }
 */
import { NextResponse } from 'next/server';
import { verifyAccessCode, createSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDayTimeLimitMin } from '@/domain/config/rules';
import {
  getSkuByIdentity,
  isValidIdentity,
  validateAccessCodeFormat,
  type Identity,
} from '@/lib/identity';

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
    const { identity, access_code, day } = body;
    const dayNum = Number(day);

    // 1. 验证身份
    if (!identity || !isValidIdentity(identity)) {
      return NextResponse.json(
        { ok: false, error: '无效的身份选择' },
        { status: 400 },
      );
    }

    // 2. 验证访问码格式
    const codeValidation = validateAccessCodeFormat(access_code);
    if (!codeValidation.valid) {
      return NextResponse.json(
        { ok: false, error: codeValidation.error },
        { status: 400 },
      );
    }

    // 3. 验证日期
    if (![1, 2, 3].includes(dayNum)) {
      return NextResponse.json(
        { ok: false, error: '参数错误：day 应为 1|2|3' },
        { status: 400 },
      );
    }

    const trimmedCode = access_code.trim().toUpperCase();
    const expectedSku = getSkuByIdentity(identity as Identity);

    // 4. 验证访问码
    const ac = await verifyAccessCode(trimmedCode);
    if (!ac) {
      return NextResponse.json(
        { ok: false, error: '访问码无效或已过期' },
        { status: 403 },
      );
    }

    // 5. 验证 identity 与 sku_code 匹配
    if (ac.skuCode && ac.skuCode !== expectedSku) {
      return NextResponse.json(
        { ok: false, error: '访问码与身份不匹配，请重新选择身份' },
        { status: 403 },
      );
    }

    const dayTag = dayNum as 1 | 2 | 3;
    const timeLimitMin = getDayTimeLimitMin(dayTag);

    // 6. 创建会话
    const session = await createSession({
      accessCode: ac.code,
      skuCode: ac.skuCode,
      studentId: ac.studentId ?? null,
      dayTag,
      timeLimitMin,
    });

    // 7. 获取题目（按 seq_no 升序）
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
        session_id: String(session.id),
        questions,
        time_limit_min: timeLimitMin,
        sku_code: ac.skuCode,
        identity: identity,
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
