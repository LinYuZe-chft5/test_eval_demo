/**
 * app/api/access/register/route.ts
 * POST /api/access/register —— 注册访问码
 *
 * 输入: { identity: 'grade7'|'grade8'|'grade9', access_code: string, nickname?: string }
 * 逻辑:
 *   1. 验证身份和访问码格式
 *   2. 检查访问码是否已存在（唯一约束）
 *   3. 创建 access_code 记录
 * 输出: { ok, access_code, identity, sku_code }
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getSkuByIdentity,
  isValidIdentity,
  validateAccessCodeFormat,
  type Identity,
} from '@/lib/identity';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { identity, access_code, nickname } = body;

    // 1. 验证身份
    if (!identity || !isValidIdentity(identity)) {
      return NextResponse.json(
        { ok: false, error: '无效的身份选择（应为 grade7/grade8/grade9）' },
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

    const trimmedCode = access_code.trim().toUpperCase();
    const skuCode = getSkuByIdentity(identity as Identity);

    if (!skuCode) {
      return NextResponse.json(
        { ok: false, error: '题库映射错误' },
        { status: 500 },
      );
    }

    // 3. 检查访问码是否已存在
    const existing = await (prisma as any).accessCodes.findUnique({
      where: { code: trimmedCode },
    });

    if (existing) {
      return NextResponse.json(
        { ok: false, error: '该访问码已被注册，请选择其他访问码' },
        { status: 409 },
      );
    }

    // 4. 创建访问码记录
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7天后过期

    const record = await (prisma as any).accessCodes.create({
      data: {
        code: trimmedCode,
        skuCode: skuCode,
        status: 'active',
        identity: identity as string,
        nickname: nickname || null,
        createdAt: now,
        expiresAt: expiresAt,
      },
    });

    return NextResponse.json({
      ok: true,
      data: {
        access_code: record.code,
        identity: record.identity,
        sku_code: record.skuCode,
        message: '注册成功，请使用访问码进入系统',
      },
    });
  } catch (err) {
    console.error('[access/register] error:', err);
    return NextResponse.json(
      { ok: false, error: '服务器错误，请稍后重试' },
      { status: 500 },
    );
  }
}
