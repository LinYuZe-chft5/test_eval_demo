/**
 * 重新创建初二访问码脚本
 * 使用 Supabase REST API（与 reset_grade8_data.cjs 保持一致）
 */

const fs = require('fs');
const path = require('path');

// ===== 加载 .env =====
function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
  ];
  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx === -1) continue;
          const key = trimmed.substring(0, eqIdx).trim();
          let value = trimmed.substring(eqIdx + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.substring(1, value.length - 1);
          }
          if (!process.env[key]) process.env[key] = value;
        }
        console.log(`[env] 已加载: ${envPath}`);
        return;
      }
    } catch (e) { /* ignore */ }
  }
  console.warn('[env] 未找到 .env 文件');
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[ERROR] 缺少环境变量: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const API_BASE = `${SUPABASE_URL}/rest/v1`;

async function apiRequest(tablePath, method = 'GET', body = null, queryParams = '') {
  const url = `${API_BASE}/${tablePath}${queryParams}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  };
  if (method === 'POST' || method === 'PATCH') {
    headers['Prefer'] = 'return=representation';
  }

  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${method} ${tablePath} 失败 (${resp.status}): ${text}`);
  }

  const text = await resp.text();
  return text ? JSON.parse(text) : [];
}

async function main() {
  console.log('========================================');
  console.log('  创建初二(grade8)访问码');
  console.log('========================================\n');

  // 检查是否已存在
  console.log('[Step 1] 检查是否已存在初二访问码...');
  try {
    const existing = await apiRequest(
      'access_codes',
      'GET',
      null,
      '?select=id,code,identity,status&identity=eq.grade8&status=eq.active'
    );

    if (existing.length > 0) {
      console.log(`已存在 ${existing.length} 条初二访问码:`);
      for (const ac of existing) {
        console.log(`  - code: ${ac.code}, status: ${ac.status}`);
      }
      console.log('\n无需创建新访问码。');
      process.exit(0);
    }
  } catch (err) {
    console.error('查询失败:', err.message);
  }

  // 创建新的访问码
  const accessCode = '123456';
  const nickname = '木木';
  const skuCode = 'S3-01';  // 初二对应的SKU代码

  console.log(`\n[Step 2] 创建访问码: code=${accessCode}, sku_code=${skuCode}, nickname=${nickname}`);

  try {
    const result = await apiRequest(
      'access_codes',
      'POST',
      {
        code: accessCode,
        sku_code: skuCode,
        identity: 'grade8',
        nickname: nickname,
        status: 'active',
        created_at: new Date().toISOString(),
      }
    );

    console.log('\n✅ 初二访问码创建成功!');
    console.log(`  访问码: ${accessCode}`);
    console.log(`  昵称: ${nickname}`);
    console.log(`  身份: 初二 (grade8)`);
    console.log(`  状态: active`);

    if (result && result.length > 0) {
      console.log(`  记录ID: ${result[0].id}`);
    }

    // 验证
    console.log('\n[Step 3] 验证访问码...');
    const verify = await apiRequest(
      'access_codes',
      'GET',
      null,
      `?select=id,code,identity,nickname,status&code=eq.${accessCode}`
    );
    console.log('验证结果:', JSON.stringify(verify, null, 2));

    console.log('\n========================================');
    console.log('请使用访问码 123456 重新登录系统');
    console.log('========================================');
  } catch (err) {
    console.error('\n❌ 创建失败:', err.message);
    process.exit(1);
  }
}

main().catch(console.error);
