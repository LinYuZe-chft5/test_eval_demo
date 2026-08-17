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
    const errorName = err?.name || '';
    
    // 捕获数据库配置错误 - 开发环境显示详细信息，生产环境返回友好提示
    if (errorName === 'SupabaseConfigError' || 
        errorMessage.includes('数据库连接配置缺失') ||
        errorMessage.includes('SUPABASE_URL未设置') ||
        errorMessage.includes('SUPABASE_SERVICE_ROLE_KEY未设置')) {
      console.error('[access/verify] 数据库配置错误，请检查 .env 文件');
      const isDev = process.env.NODE_ENV !== 'production';
      return NextResponse.json(
        { 
          ok: false, 
          error: isDev
            ? `[DEV] 配置缺失：${errorMessage}。请在项目根目录创建 .env 文件并配置 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY`
            : '系统正在维护中，请稍后再试'
        },
        { status: 503 },
      );
    }
    
    // 网络连接错误
    if (errorMessage.includes('网络连接') || errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED')) {
      return NextResponse.json(
        { ok: false, error: '网络连接失败，请检查网络后重试' },
        { status: 502 },
      );
    }
    
    // 数据库查询错误（如访问码不存在等）
    if (errorMessage.includes('不存在') || errorMessage.includes('未找到') || errorMessage.includes('404')) {
      return NextResponse.json(
        { ok: false, error: '访问码无效或已过期' },
        { status: 404 },
      );
    }
    
    // 未知错误 - 返回通用提示
    return NextResponse.json(
      { ok: false, error: '服务器内部错误，请稍后重试' },
      { status: 500 },
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
