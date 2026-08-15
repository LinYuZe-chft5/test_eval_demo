/**
 * app/api/access/verify/route.ts
 * POST /api/access/verify —— 验证访问码
 *
 * 输入: { identity: 'grade7'|'grade8'|'grade9', access_code: string }
 * 逻辑:
 *   1. 验证身份和访问码格式
 *   2. 查 access_codes 表，验证 status='active' 且未过期
 *   3. 验证 identity 与访问码的 identity 匹配
 * 输出: { valid, student_id?, sku_code?, identity?, days_available?, completed_days? }
 */
import { NextResponse } from 'next/server';
import { verifyAccessCode, getCompletedSessions } from '@/lib/auth';
import {
  getSkuByIdentity,
  isValidIdentity,
  validateAccessCodeFormat,
  type Identity,
} from '@/lib/identity';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { identity, access_code } = body;

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
    const expectedSku = getSkuByIdentity(identity as Identity);

    // 3. 验证访问码
    const record = await verifyAccessCode(trimmedCode);
    if (!record) {
      return NextResponse.json({
        ok: true,
        data: { valid: false, error: '访问码无效或已过期' },
      });
    }

    // 4. 验证 identity 匹配
    if (record.identity && record.identity !== identity) {
      return NextResponse.json({
        ok: true,
        data: {
          valid: false,
          error: `该访问码已注册为「${getIdentityLabel(record.identity)}」身份，请选择正确的身份`,
        },
      });
    }

    // 5. 获取已完成的天数
    const completed = await getCompletedSessions(trimmedCode);
    const completedDays: number[] = (completed ?? [])
      .map((s: any) => Number(s.dayTag))
      .filter((n) => [1, 2, 3].includes(n));

    return NextResponse.json({
      ok: true,
      data: {
        valid: true,
        student_id: record.studentId ?? null,
        sku_code: record.skuCode,
        identity: record.identity || identity,
        days_available: [1, 2, 3],
        completed_days: completedDays,
        nickname: record.nickname ?? null,
      },
    });
  } catch (err: any) {
    console.error('[access/verify] error:', err);
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

function getIdentityLabel(identity: string): string {
  const labels: Record<string, string> = {
    grade7: '初一',
    grade8: '初二',
    grade9: '初三',
  };
  return labels[identity] || identity;
}
