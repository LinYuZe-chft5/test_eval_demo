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

// Next.js App Router 动态路由标记
export const dynamic = 'force-dynamic';

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
  } catch (err: any) {
    console.error('[access/register] error:', err);
    const errorMessage = err?.message || '服务器内部错误';
    
    // 根据错误类型返回不同的错误消息
    let statusCode = 500;
    if (errorMessage.includes('不存在') || errorMessage.includes('未找到')) {
      statusCode = 404;
    } else if (errorMessage.includes('冲突') || errorMessage.includes('已被注册')) {
      statusCode = 409;
    } else if (errorMessage.includes('配置错误') || errorMessage.includes('连接地址')) {
      statusCode = 503;
    } else if (errorMessage.includes('网络连接')) {
      statusCode = 502;
    }
    
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: statusCode },
    );
  }
}
