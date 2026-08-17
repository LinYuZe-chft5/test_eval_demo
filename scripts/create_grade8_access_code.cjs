/**
 * 重新创建初二访问码脚本
 * 用于在数据重置后重新创建访问码
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('缺少环境变量: NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('========================================');
  console.log('  创建初二(grade8)访问码');
  console.log('========================================\n');

  // 检查是否已存在
  const { data: existing, error: checkError } = await supabase
    .from('access_codes')
    .select('id, code, identity, status')
    .eq('identity', 'grade8')
    .eq('status', 'active');

  if (checkError) {
    console.error('查询失败:', checkError.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log(`已存在 ${existing.length} 条初二访问码:`);
    for (const ac of existing) {
      console.log(`  - code: ${ac.code}, status: ${ac.status}`);
    }
    console.log('\n无需创建新访问码。');
    process.exit(0);
  }

  // 创建新的访问码
  const accessCode = '123456';
  const nickname = '木木';

  console.log(`创建访问码: code=${accessCode}, nickname=${nickname}`);

  const { data, error } = await supabase
    .from('access_codes')
    .insert([
      {
        code: accessCode,
        identity: 'grade8',
        nickname: nickname,
        status: 'active',
        created_at: new Date().toISOString(),
      },
    ])
    .select();

  if (error) {
    console.error('创建失败:', error.message);
    process.exit(1);
  }

  console.log('\n✅ 初二访问码创建成功!');
  console.log(`  访问码: ${accessCode}`);
  console.log(`  昵称: ${nickname}`);
  console.log(`  身份: 初二 (grade8)`);
  console.log(`  状态: active`);

  // 验证
  console.log('\n验证访问码...');
  const { data: verify, error: verifyError } = await supabase
    .from('access_codes')
    .select('id, code, identity, nickname, status')
    .eq('code', accessCode);

  if (verifyError) {
    console.error('验证失败:', verifyError.message);
  } else {
    console.log('验证结果:', JSON.stringify(verify, null, 2));
  }

  console.log('\n========================================');
  console.log('请使用访问码 123456 重新登录系统');
  console.log('========================================');
}

main().catch(console.error);
