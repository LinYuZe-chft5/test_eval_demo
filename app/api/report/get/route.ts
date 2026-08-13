/**
 * app/api/report/get/route.ts
 * GET /api/report/get?student_id=xxx —— 获取诊断报告
 *
 * 逻辑: 查询 report_drafts 表（取最新一条）
 * 输出: ReportDraft JSON
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('student_id');

    if (!studentId) {
      return NextResponse.json(
        { ok: false, error: '缺少 student_id' },
        { status: 400 },
      );
    }

    const row = await (prisma as any).reportDrafts.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });

    if (!row) {
      return NextResponse.json(
        { ok: false, error: '报告尚未生成' },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: row.draft });
  } catch (err) {
    console.error('[report/get] error:', err);
    return NextResponse.json(
      { ok: false, error: '服务器错误' },
      { status: 500 },
    );
  }
}
