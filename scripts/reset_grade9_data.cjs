/**
 * scripts/reset_grade9_data.cjs
 * 重置初三(S6-01)身份注册的所有用户数据、答题记录、报告数据
 *
 * 删除顺序（按外键依赖）:
 *   1. report_drafts   (依赖 students)
 *   2. records          (依赖 students / sessions)
 *   3. test_sessions    (依赖 students)
 *   4. students         (依赖 access_codes)
 *   5. access_codes     (sku_code = 'S6-01')
 *
 * 运行: node scripts/reset_grade9_data.cjs
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
  if (method === 'DELETE' || method === 'PATCH') {
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

async function deleteByFilter(table, filter) {
  const queryParams = `?${filter}`;
  const result = await apiRequest(table, 'DELETE', null, queryParams);
  return Array.isArray(result) ? result.length : 0;
}

async function selectByFilter(table, select, filter) {
  const queryParams = `?select=${select}&${filter}`;
  return await apiRequest(table, 'GET', null, queryParams);
}

async function main() {
  console.log('========================================================');
  console.log('  初三(S6-01) 数据重置脚本');
  console.log('  目标: 删除所有用户、答题记录、报告数据');
  console.log('========================================================\n');

  // Step 1: 查找所有 S6-01 的 access_codes
  console.log('[Step 1] 查找初三身份的 access_codes...');
  const accessCodes = await selectByFilter(
    'access_codes',
    'id,code,sku_code,identity,nickname,status',
    'sku_code=eq.S6-01'
  );
  console.log(`  找到 ${accessCodes.length} 条 access_codes 记录:`);
  for (const ac of accessCodes) {
    console.log(`    - code=${ac.code}, nickname=${ac.nickname || 'N/A'}, status=${ac.status}`);
  }

  if (accessCodes.length === 0) {
    console.log('\n[完成] 没有找到初三身份的注册数据，无需重置。');
    return;
  }

  const accessCodeIds = accessCodes.map(ac => ac.id);
  const idList = accessCodeIds.join(',');

  // Step 2: 查找关联的 students
  console.log('\n[Step 2] 查找关联的 students...');
  const students = await selectByFilter(
    'students',
    'id,access_code_id,nickname,grade',
    `access_code_id=in.(${idList})`
  );
  console.log(`  找到 ${students.length} 条 students 记录`);

  const studentIds = students.map(s => s.id);
  const studentIdList = studentIds.length > 0 ? studentIds.join(',') : '0';

  // Step 3: 查找关联的 test_sessions
  console.log('\n[Step 3] 查找关联的 test_sessions...');
  const sessions = studentIds.length > 0
    ? await selectByFilter('test_sessions', 'id,student_id,day_tag,status', `student_id=in.(${studentIdList})`)
    : [];
  console.log(`  找到 ${sessions.length} 条 test_sessions 记录`);

  const sessionIds = sessions.map(s => s.id);
  const sessionIdList = sessionIds.length > 0 ? sessionIds.join(',') : '0';

  // ===== 开始删除 =====
  console.log('\n--------------------------------------------------------');
  console.log('  开始删除数据（按外键依赖顺序）');
  console.log('--------------------------------------------------------\n');

  // Step 4: 删除 reports (通过 student_id 关联，必须先于 students 删除)
  if (studentIds.length > 0) {
    console.log('[Step 4] 删除 reports...');
    try {
      const count = await deleteByFilter('reports', `student_id=in.(${studentIdList})`);
      console.log(`  已删除 ${count} 条 reports`);
    } catch (e) {
      console.log(`  reports 删除跳过: ${e.message}`);
    }
  } else {
    console.log('[Step 4] 跳过 reports（无关联数据）');
  }

  // Step 4b: 删除 report_drafts (通过 student_id 关联)
  if (studentIds.length > 0) {
    console.log('\n[Step 4b] 删除 report_drafts...');
    try {
      const count = await deleteByFilter('report_drafts', `student_id=in.(${studentIdList})`);
      console.log(`  已删除 ${count} 条 report_drafts`);
    } catch (e) {
      console.log(`  report_drafts 删除跳过（表可能不存在）: ${e.message.substring(0, 80)}`);
    }
  }

  // Step 5: 删除 records (通过 student_id 或 session_id 关联)
  if (studentIds.length > 0) {
    console.log('\n[Step 5] 删除 records (by student_id)...');
    try {
      const count = await deleteByFilter('records', `student_id=in.(${studentIdList})`);
      console.log(`  已删除 ${count} 条 records (by student_id)`);
    } catch (e) {
      console.log(`  records by student_id 删除失败，尝试 by session_id...`);
      if (sessionIds.length > 0) {
        try {
          const count = await deleteByFilter('records', `session_id=in.(${sessionIdList})`);
          console.log(`  已删除 ${count} 条 records (by session_id)`);
        } catch (e2) {
          console.log(`  records 删除跳过: ${e2.message}`);
        }
      }
    }
  } else {
    console.log('\n[Step 5] 跳过 records（无关联数据）');
  }

  // Step 6: 删除 answer_events
  if (sessionIds.length > 0) {
    console.log('\n[Step 6] 删除 answer_events...');
    try {
      const count = await deleteByFilter('answer_events', `session_id=in.(${sessionIdList})`);
      console.log(`  已删除 ${count} 条 answer_events`);
    } catch (e) {
      console.log(`  answer_events 删除跳过: ${e.message}`);
    }
  } else {
    console.log('\n[Step 6] 跳过 answer_events（无关联数据）');
  }

  // Step 7: 删除 answer_records
  if (sessionIds.length > 0) {
    console.log('\n[Step 7] 删除 answer_records...');
    try {
      const count = await deleteByFilter('answer_records', `session_id=in.(${sessionIdList})`);
      console.log(`  已删除 ${count} 条 answer_records`);
    } catch (e) {
      console.log(`  answer_records 删除跳过: ${e.message}`);
    }
  } else {
    console.log('\n[Step 7] 跳过 answer_records（无关联数据）');
  }

  // Step 8: 删除 test_sessions
  if (studentIds.length > 0) {
    console.log('\n[Step 8] 删除 test_sessions...');
    const count = await deleteByFilter('test_sessions', `student_id=in.(${studentIdList})`);
    console.log(`  已删除 ${count} 条 test_sessions`);
  } else {
    console.log('\n[Step 8] 跳过 test_sessions（无关联数据）');
  }

  // Step 9: 删除 students
  if (accessCodeIds.length > 0) {
    console.log('\n[Step 9] 删除 students...');
    const count = await deleteByFilter('students', `access_code_id=in.(${idList})`);
    console.log(`  已删除 ${count} 条 students`);
  } else {
    console.log('\n[Step 9] 跳过 students（无关联数据）');
  }

  // Step 10: 删除 access_codes
  console.log('\n[Step 10] 删除 access_codes (sku_code=S6-01)...');
  const count = await deleteByFilter('access_codes', 'sku_code=eq.S6-01');
  console.log(`  已删除 ${count} 条 access_codes`);

  // ===== 验证 =====
  console.log('\n--------------------------------------------------------');
  console.log('  验证删除结果');
  console.log('--------------------------------------------------------\n');

  const remainingAC = await selectByFilter('access_codes', 'id,code,sku_code', 'sku_code=eq.S6-01');
  console.log(`[验证] 剩余 S6-01 access_codes: ${remainingAC.length} 条`);

  if (accessCodeIds.length > 0) {
    const remainingStudents = await selectByFilter('students', 'id', `access_code_id=in.(${idList})`);
    console.log(`[验证] 剩余关联 students: ${remainingStudents.length} 条`);
  }

  console.log('\n========================================================');
  console.log('  数据重置完成！');
  console.log('  初三身份的所有用户数据、答题记录、报告数据已清空。');
  console.log('  可重新注册访问码进行测评。');
  console.log('========================================================');
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
