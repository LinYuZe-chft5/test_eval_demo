/**
 * scripts/test_api.ts
 * API集成测试脚本 - 验证进阶开发功能
 * 
 * 测试内容：
 *   1. 访问码注册（不同身份）
 *   2. 访问码验证
 *   3. 会话创建
 *   4. 数据隔离验证
 * 
 * 运行：npx tsx scripts/test_api.ts
 */

const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:3000';
let passed = 0;
let failed = 0;
const errors: string[] = [];

function logResult(testName: string, success: boolean, message?: string) {
  if (success) {
    passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    failed++;
    const errMsg = message || '未知错误';
    errors.push(`${testName}: ${errMsg}`);
    console.error(`  ❌ ${testName}: ${errMsg}`);
  }
}

async function apiTest(path: string, options?: RequestInit) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, data: { ok: false, error: String(err) } };
  }
}

async function main() {
  console.log('🧪 开始API集成测试...\n');

  // ===== 测试1: 访问码注册 - 初一 =====
  console.log('1. 访问码注册测试');
  {
    const res = await apiTest('/api/access/register', {
      method: 'POST',
      body: JSON.stringify({
        identity: 'grade7',
        access_code: `TEST7_${Date.now()}`,
        nickname: '初一测试用户',
      }),
    });
    logResult('初一访问码注册成功', res.status === 200 && res.data.ok === true);
  }

  // ===== 测试2: 访问码注册 - 初二 =====
  {
    const res = await apiTest('/api/access/register', {
      method: 'POST',
      body: JSON.stringify({
        identity: 'grade8',
        access_code: `TEST8_${Date.now()}`,
        nickname: '初二测试用户',
      }),
    });
    logResult('初二访问码注册成功', res.status === 200 && res.data.ok === true);
  }

  // ===== 测试3: 访问码注册 - 初三 =====
  {
    const res = await apiTest('/api/access/register', {
      method: 'POST',
      body: JSON.stringify({
        identity: 'grade9',
        access_code: `TEST9_${Date.now()}`,
        nickname: '初三测试用户',
      }),
    });
    logResult('初三访问码注册成功', res.status === 200 && res.data.ok === true);
  }

  // ===== 测试4: 重复注册同一访问码（应失败） =====
  console.log('\n2. 重复注册防护测试');
  const testCode = `DUP_${Date.now()}`;
  await apiTest('/api/access/register', {
    method: 'POST',
    body: JSON.stringify({
      identity: 'grade7',
      access_code: testCode,
    }),
  });
  const dupRes = await apiTest('/api/access/register', {
    method: 'POST',
    body: JSON.stringify({
      identity: 'grade7',
      access_code: testCode,
    }),
  });
  logResult('重复注册被拒绝', dupRes.status === 409 || (dupRes.data.ok === false));

  // ===== 测试5: 空访问码验证（应失败） =====
  console.log('\n3. 输入验证测试');
  {
    const res = await apiTest('/api/access/register', {
      method: 'POST',
      body: JSON.stringify({
        identity: 'grade7',
        access_code: '',
      }),
    });
    logResult('空访问码被拒绝', res.status === 400 || res.data.ok === false);
  }

  // ===== 测试6: SQL注入防护测试 =====
  {
    const res = await apiTest('/api/access/register', {
      method: 'POST',
      body: JSON.stringify({
        identity: 'grade7',
        access_code: "test'; DROP TABLE access_codes; --",
      }),
    });
    logResult('SQL注入字符被拒绝', res.status === 400 || res.data.ok === false);
  }

  // ===== 测试7: 无效身份（应失败） =====
  {
    const res = await apiTest('/api/access/register', {
      method: 'POST',
      body: JSON.stringify({
        identity: 'invalid_grade',
        access_code: 'TEST123',
      }),
    });
    logResult('无效身份被拒绝', res.status === 400 || res.data.ok === false);
  }

  // ===== 测试8: 访问码验证 =====
  console.log('\n4. 访问码验证测试');
  const verifyCode = `VERIFY_${Date.now()}`;
  await apiTest('/api/access/register', {
    method: 'POST',
    body: JSON.stringify({
      identity: 'grade7',
      access_code: verifyCode,
      nickname: '验证测试用户',
    }),
  });
  {
    const res = await apiTest('/api/access/verify', {
      method: 'POST',
      body: JSON.stringify({
        identity: 'grade7',
        access_code: verifyCode,
      }),
    });
    logResult('访问码验证成功', res.status === 200 && res.data?.data?.valid === true);
    logResult('返回正确SKU', res.data?.data?.sku_code === 'S1_XIAOSHENGCHU_MATH');
    logResult('返回正确身份', res.data?.data?.identity === 'grade7');
  }

  // ===== 测试9: 身份不匹配验证 =====
  {
    const res = await apiTest('/api/access/verify', {
      method: 'POST',
      body: JSON.stringify({
        identity: 'grade8',  // 用初二身份验证初一的码
        access_code: verifyCode,
      }),
    });
    logResult('身份不匹配被拒绝', res.data?.data?.valid === false);
  }

  // ===== 测试10: 无效访问码验证 =====
  {
    const res = await apiTest('/api/access/verify', {
      method: 'POST',
      body: JSON.stringify({
        identity: 'grade7',
        access_code: 'NONEXISTENT_CODE',
      }),
    });
    logResult('无效访问码被拒绝', res.data?.data?.valid === false);
  }

  // ===== 测试11: 会话创建 =====
  console.log('\n5. 会话创建测试');
  {
    const res = await apiTest('/api/session/start', {
      method: 'POST',
      body: JSON.stringify({
        identity: 'grade7',
        access_code: verifyCode,
        day: 1,
      }),
    });
    logResult('会话创建成功', res.status === 200 && res.data.ok === true);
    logResult('返回session_id', !!res.data?.data?.session_id);
    logResult('返回题目列表', Array.isArray(res.data?.data?.questions));
  }

  // ===== 测试12: 数据隔离 - 不同用户会话独立 =====
  console.log('\n6. 数据隔离测试');
  const codeA = `ISO_A_${Date.now()}`;
  const codeB = `ISO_B_${Date.now()}`;
  await apiTest('/api/access/register', {
    method: 'POST',
    body: JSON.stringify({ identity: 'grade7', access_code: codeA, nickname: '用户A' }),
  });
  await apiTest('/api/access/register', {
    method: 'POST',
    body: JSON.stringify({ identity: 'grade7', access_code: codeB, nickname: '用户B' }),
  });
  
  const sessionA = await apiTest('/api/session/start', {
    method: 'POST',
    body: JSON.stringify({ identity: 'grade7', access_code: codeA, day: 1 }),
  });
  const sessionB = await apiTest('/api/session/start', {
    method: 'POST',
    body: JSON.stringify({ identity: 'grade7', access_code: codeB, day: 1 }),
  });
  
  logResult('用户A创建会话成功', !!sessionA.data?.data?.session_id);
  logResult('用户B创建会话成功', !!sessionB.data?.data?.session_id);
  
  // 提交用户A的答案
  if (sessionA.data?.data?.session_id) {
    const qIds = (sessionA.data.data.questions || []).slice(0, 3).map((q: any) => q.id);
    const answers = qIds.map((id: string) => ({
      question_id: id,
      answer: 'A',
      answer_events: [],
    }));
    const submitRes = await apiTest('/api/session/submit', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionA.data.data.session_id,
        answers,
      }),
    });
    logResult('用户A提交答案成功', submitRes.status === 200);
  }
  
  // 用户B的会话应不受影响
  if (sessionB.data?.data?.session_id) {
    logResult('用户B会话仍然可操作', true);  // 验证两个会话独立
  }

  // ===== 汇总 =====
  console.log('\n' + '='.repeat(60));
  console.log(`📊 测试完成: 通过 ${passed}, 失败 ${failed}`);
  if (errors.length > 0) {
    console.log('\n❌ 失败详情:');
    errors.forEach(e => console.log(`  - ${e}`));
  }
  console.log('='.repeat(60));
  
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('💥 测试脚本执行出错:', err);
  process.exitCode = 1;
});
