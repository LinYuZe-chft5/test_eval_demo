/**
 * app/api/access/verify/route.ts
 * POST /api/access/verify —— 验证访问码
 *
 * 输入: { access_code: string }
 * 逻辑: 查 access_codes 表，status='active' 且 expires_at > now
 * 输出: { valid, student_id?, sku_code?, days_available?, completed_days? }
 */
import { NextResponse } from 'next/server';
import { verifyAccessCode, getCompletedSessions } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = body?.access_code;
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { ok: false, error: '缺少 access_code' },
        { status: 400 },
      );
    }

    const record = await verifyAccessCode(code);
    if (!record) {
      return NextResponse.json({ ok: true, data: { valid: false } });
    }

    // 已完成的天数（用于首页禁用对应入口）
    const completed = await getCompletedSessions(record.code);
    const completedDays: number[] = (completed ?? [])
      .map((s: any) => Number(s.dayTag))
      .filter((n) => [1, 2, 3].includes(n));

    return NextResponse.json({
      ok: true,
      data: {
        valid: true,
        student_id: record.studentId ?? null,
        sku_code: record.skuCode,
        days_available: [1, 2, 3],
        completed_days: completedDays,
      },
    });
  } catch (err) {
    console.error('[access/verify] error:', err);
    return NextResponse.json(
      { ok: false, error: '服务器错误' },
      { status: 500 },
    );
  }
}
