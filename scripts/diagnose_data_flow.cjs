/**
 * 数据流诊断脚本
 * 使用 Supabase REST API（与 reset_grade8_data.cjs 保持一致）
 * 直接从数据库读取数据，检查关键数据结构
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
  console.log(' 数据流诊断脚本');
  console.log('========================================\n');

  // Step 1: 检查初二访问码
  console.log('[Step 1] 检查初二访问码...');
  let accessCodes = [];
  try {
    accessCodes = await apiRequest(
      'access_codes',
      'GET',
      null,
      '?select=id,code,identity,status&identity=eq.grade8'
    );

    console.log(`  找到 ${accessCodes.length} 条访问码:`);
    for (const ac of accessCodes) {
      console.log(`    - code: ${ac.code}, status: ${ac.status}`);
    }
  } catch (err) {
    console.error('  ❌ 查询失败:', err.message);
  }

  if (accessCodes.length === 0) {
    console.log('\n⚠️  没有初二访问码，请先运行: node scripts/create_grade8_access_code.cjs');
    process.exit(0);
  }

  // Step 2: 检查初二学生
  console.log('\n[Step 2] 检查初二学生...');
  let students = [];
  try {
    const acId = accessCodes[0].id;
    students = await apiRequest(
      'students',
      'GET',
      null,
      `?select=id,nickname,grade,access_code_id&access_code_id=eq.${acId}`
    );

    console.log(`  找到 ${students.length} 个学生:`);
    for (const s of students) {
      console.log(`    - id: ${s.id}, nickname: ${s.nickname}, grade: ${s.grade}`);
    }
  } catch (err) {
    console.error('  ❌ 查询失败:', err.message);
  }

  if (students.length === 0) {
    console.log('\n⚠️  没有学生数据，请先完成测评');
    process.exit(0);
  }

  const student = students[0];

  // Step 3: 检查答题会话
  console.log(`\n[Step 3] 检查学生 ${student.nickname} 的答题会话...`);
  let sessions = [];
  try {
    sessions = await apiRequest(
      'sessions',
      'GET',
      null,
      `?select=id,day_tag,status,created_at&student_id=eq.${student.id}&order=day_tag`
    );

    console.log(`  找到 ${sessions.length} 个会话:`);
    for (const sess of sessions) {
      console.log(`    - Day${sess.day_tag}: status=${sess.status}`);
    }
  } catch (err) {
    console.error('  ❌ 查询失败:', err.message);
    // 尝试表名 test_sessions
    try {
      sessions = await apiRequest(
        'test_sessions',
        'GET',
        null,
        `?select=id,day_tag,status,created_at&student_id=eq.${student.id}&order=day_tag`
      );
      console.log(`  (使用 test_sessions 表) 找到 ${sessions.length} 个会话:`);
      for (const sess of sessions) {
        console.log(`    - Day${sess.day_tag}: status=${sess.status}`);
      }
    } catch (err2) {
      console.error('  ❌ test_sessions 也失败:', err2.message);
    }
  }

  // Step 4: 检查答题记录
  if (sessions.length > 0) {
    console.log('\n[Step 4] 检查答题记录...');
    let totalRecords = 0;
    let correctCount = 0;
    let totalScore = 0;
    const allRecords = [];

    for (const sess of sessions) {
      try {
        // 尝试 records 表
        const records = await apiRequest(
          'records',
          'GET',
          null,
          `?select=question_id,answer,is_correct,score,time_spent_ms&session_id=eq.${sess.id}`
        );
        allRecords.push(...records);
      } catch (err) {
        // 尝试 answer_records 表
        try {
          const records = await apiRequest(
            'answer_records',
            'GET',
            null,
            `?select=question_id,answer,is_correct,score,time_spent_ms&session_id=eq.${sess.id}`
          );
          allRecords.push(...records);
        } catch (err2) {
          console.error(`  ❌ 会话 ${sess.id} 查询失败:`, err2.message);
        }
      }
    }

    totalRecords = allRecords.length;
    correctCount = allRecords.filter(r => r.is_correct).length;
    totalScore = allRecords.reduce((sum, r) => sum + (r.score || 0), 0);

    console.log(`  共找到 ${totalRecords} 条记录:`);
    console.log(`    - 正确: ${correctCount}/${totalRecords}`);
    console.log(`    - 总分: ${totalScore}`);

    if (totalRecords > 0) {
      console.log(`    - 前3条记录样例:`);
      for (let i = 0; i < Math.min(3, totalRecords); i++) {
        const r = allRecords[i];
        const answer = typeof r.answer === 'string' ? r.answer.substring(0, 30) : JSON.stringify(r.answer).substring(0, 30);
        console.log(`      [${i}] Q:${r.question_id}, ✓:${r.is_correct}, 得分:${r.score}, 用时:${r.time_spent_ms}ms, 答案:"${answer}"`);
      }
    }
  }

  // Step 5: 检查报告
  console.log(`\n[Step 5] 检查学生 ${student.nickname} 的报告...`);
  let reports = [];
  try {
    // 尝试 report_drafts 表
    reports = await apiRequest(
      'report_drafts',
      'GET',
      null,
      `?select=id,status,total_score,module_mastery,plan_4week,action_checklist&student_id=eq.${student.id}&order=created_at.desc&limit=1`
    );
  } catch (err) {
    // 尝试 reports 表
    try {
      reports = await apiRequest(
        'reports',
        'GET',
        null,
        `?select=id,status,total_score,module_mastery,plan_4week,action_checklist&student_id=eq.${student.id}&order=created_at.desc&limit=1`
      );
    } catch (err2) {
      console.error('  ❌ 查询失败:', err2.message);
    }
  }

  if (reports.length > 0) {
    const report = reports[0];
    console.log(`  找到报告 ID: ${report.id}`);
    console.log(`    - 状态: ${report.status}`);
    console.log(`    - 总分: ${report.total_score}`);

    // 检查 module_mastery
    if (report.module_mastery) {
      const mm = report.module_mastery;
      // 如果是字符串，尝试解析
      const mmObj = typeof mm === 'string' ? JSON.parse(mm) : mm;
      const keys = Object.keys(mmObj);
      console.log(`    - module_mastery 键数量: ${keys.length}`);
      if (keys.length > 0) {
        console.log(`      前3个知识点:`);
        for (const k of keys.slice(0, 3)) {
          const v = mmObj[k];
          console.log(`        ${k}: ${JSON.stringify(v).substring(0, 100)}`);
          // 检查内部键名格式
          if (typeof v === 'object' && v !== null) {
            const innerKeys = Object.keys(v);
            console.log(`          内部键: [${innerKeys.join(', ')}]`);
            console.log(`          ⭐ 包含 mastery_score: ${innerKeys.includes('mastery_score')}`);
            console.log(`          ❌ 包含 masteryScore: ${innerKeys.includes('masteryScore')}`);
          }
        }
      }
    } else {
      console.log(`    ❌ module_mastery 为空!`);
    }

    // 检查 plan_4week
    if (report.plan_4week) {
      const pw = report.plan_4week;
      const pwObj = typeof pw === 'string' ? JSON.parse(pw) : pw;
      const isArray = Array.isArray(pwObj);
      console.log(`    - plan_4week 类型: ${isArray ? '数组' : typeof pwObj}`);
      if (isArray) {
        console.log(`    - plan_4week 长度: ${pwObj.length}`);
        if (pwObj.length > 0) {
          const firstWeek = pwObj[0];
          console.log(`      第1周数据:`);
          console.log(`        键: [${Object.keys(firstWeek).join(', ')}]`);
          console.log(`        ⭐ 包含 focus_kps: ${'focus_kps' in firstWeek}`);
          console.log(`        ❌ 包含 focusKps: ${'focusKps' in firstWeek}`);
          console.log(`        ⭐ 包含 weekly_content: ${'weekly_content' in firstWeek}`);
          console.log(`        ❌ 包含 weeklyContent: ${'weeklyContent' in firstWeek}`);
        }
      }
    } else {
      console.log(`    ❌ plan_4week 为空!`);
    }

    // 检查 action_checklist
    if (report.action_checklist) {
      const ac = report.action_checklist;
      const acObj = typeof ac === 'string' ? JSON.parse(ac) : ac;
      const isArray = Array.isArray(acObj);
      console.log(`    - action_checklist 类型: ${isArray ? '数组' : typeof acObj}`);
      if (isArray) {
        console.log(`    - action_checklist 长度: ${acObj.length}`);
        if (acObj.length > 0) {
          const firstItem = acObj[0];
          console.log(`      第1条数据:`);
          console.log(`        键: [${Object.keys(firstItem).join(', ')}]`);
          console.log(`        ⭐ 包含 kp_code: ${'kp_code' in firstItem}`);
          console.log(`        ❌ 包含 kpCode: ${'kpCode' in firstItem}`);
          console.log(`        ⭐ 包含 name: ${'name' in firstItem}`);
          console.log(`        ⭐ 包含 level: ${'level' in firstItem}`);
          console.log(`        ⭐ 包含 action: ${'action' in firstItem}`);
        }
      }
    } else {
      console.log(`    ❌ action_checklist 为空!`);
    }
  } else {
    console.log(`    ❌ 没有报告! 请完成测评后再提交`);
  }

  // Step 6: 检查题库知识点映射
  console.log('\n[Step 6] 检查题库知识点映射...');
  try {
    const questions = await apiRequest(
      'questions',
      'GET',
      null,
      '?select=id,sku_code,day_tag,seq_no,kp_code,knowledge_points&sku_code=eq.S3-01&status=eq.active&limit=3'
    );

    console.log(`  找到 ${questions.length} 道初二题目:`);
    for (const q of questions) {
      console.log(`    - ID: ${q.id}, Day${q.day_tag}-Q${q.seq_no}, kp_code: ${q.kp_code}`);
      if (q.knowledge_points) {
        const kp = typeof q.knowledge_points === 'string' ? JSON.parse(q.knowledge_points) : q.knowledge_points;
        console.log(`      knowledge_points: ${JSON.stringify(kp).substring(0, 150)}`);
      } else {
        console.log(`      ❌ knowledge_points 为空!`);
      }
    }
  } catch (err) {
    console.error('  ❌ 查询失败:', err.message);
  }

  console.log('\n========================================');
  console.log(' 诊断完成');
  console.log('========================================');
  console.log('\n📋 请将以上输出复制反馈给开发者');
}

main().catch(err => {
  console.error('诊断脚本执行失败:', err);
  process.exit(1);
});
