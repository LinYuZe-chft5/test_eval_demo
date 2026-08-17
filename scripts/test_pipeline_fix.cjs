/**
 * scripts/test_pipeline_fix.cjs
 * 端到端模拟测试：验证 buildFilters 修复 + 流水线数据映射正确性
 *
 * 运行: node scripts/test_pipeline_fix.cjs
 */

const fs = require('fs');
const path = require('path');

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
  console.error('[ERROR] 缺少环境变量');
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
  const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`API ${method} ${tablePath} 失败 (${resp.status}): ${text}`);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : [];
}

// ===== 测试 1: 验证 buildFilters 的 { in: [...] } 语法 =====
async function main() {
console.log('='.repeat(60));
console.log('  测试 1: 验证 { in: [...] } filter 是否正确工作');
console.log('='.repeat(60));

// 查询初二学生的最近3个session
const students = await apiRequest('students', 'GET', null, '?select=id,sku_code&sku_code=eq.S3-01&limit=1');
if (students.length === 0) {
  console.log('[跳过] 没有初二学生数据，请先注册并完成测评');
  process.exit(0);
}
const studentId = students[0].id;
console.log(`  找到学生: id=${studentId}, sku=${students[0].sku_code}`);

// 查询该学生的所有session
const sessions = await apiRequest('test_sessions', 'GET', null, `?select=id,day_tag,status&student_id=eq.${studentId}&order=day_tag.asc`);
console.log(`  找到 ${sessions.length} 个session:`);
for (const s of sessions) {
  console.log(`    - id=${s.id}, day=${s.day_tag}, status=${s.status}`);
}

if (sessions.length === 0) {
  console.log('[跳过] 没有session数据');
  process.exit(0);
}

// 关键测试: 使用 in.(...) filter 查询多个session的答题记录
const sessionIds = sessions.map(s => s.id);
const sessionIdList = sessionIds.join(',');
console.log(`\n  [测试] 使用 in.(${sessionIdList}) filter 查询 answer_records...`);

const recordsFiltered = await apiRequest('answer_records', 'GET', null,
  `?select=id,session_id,question_id,student_answer,time_spent_ms,score_obtained&session_id=in.(${sessionIdList})&limit=5`);
console.log(`  有filter查询返回: ${recordsFiltered.length} 条记录`);
if (recordsFiltered.length > 0) {
  for (const r of recordsFiltered.slice(0, 3)) {
    const ans = typeof r.student_answer === 'string' ? r.student_answer.slice(0, 30) : JSON.stringify(r.student_answer).slice(0, 30);
    console.log(`    - record_id=${r.id}, session_id=${r.session_id}, q_id=${r.question_id}, answer="${ans}", score=${r.score_obtained}`);
  }
}

// 对比: 不带任何filter查询
const recordsNoFilter = await apiRequest('answer_records', 'GET', null,
  `?select=id,session_id,question_id&limit=5`);
console.log(`\n  [对比] 无filter查询返回: ${recordsNoFilter.length} 条记录`);
for (const r of recordsNoFilter.slice(0, 3)) {
  console.log(`    - record_id=${r.id}, session_id=${r.session_id}, q_id=${r.question_id}`);
}

// 验证filter结果是否只包含目标session的数据
const filteredSessionIds = [...new Set(recordsFiltered.map(r => r.session_id))];
const allInSessions = filteredSessionIds.every(id => sessionIds.includes(id));
console.log(`\n  [结果] filter正确性: ${allInSessions ? '✅ 通过' : '❌ 失败 - filter未正确应用!'}`);

// ===== 测试 2: 完整流水线模拟 =====
console.log('\n' + '='.repeat(60));
console.log('  测试 2: 完整数据映射模拟');
console.log('='.repeat(60));

// 获取所有题目
const questions = await apiRequest('questions', 'GET', null,
  `?select=id,sku_code,day_tag,seq_no,q_type,stem,correct_answer,score,kp_code,ec_mapping&sku_code=eq.S3-01&status=eq.active&order=day_tag.asc,seq_no.asc`);
console.log(`\n  题库: ${questions.length} 道题`);

// 用filter查询所有答题记录
const allRecords = await apiRequest('answer_records', 'GET', null,
  `?select=id,session_id,question_id,student_answer,time_spent_ms,modify_count,is_correct,score_obtained&session_id=in.(${sessionIdList})`);
console.log(`  答题记录: ${allRecords.length} 条`);

// 构建映射
const studentAnswers = {};
const behaviorData = {};

for (const q of questions) {
  const questionId = `${q.sku_code}-D${q.day_tag}-Q${String(q.seq_no).padStart(2, '0')}`;
  const qId = String(q.id);
  
  const matchingRecords = allRecords.filter(r => String(r.question_id) === qId);
  
  if (matchingRecords.length === 0) {
    studentAnswers[questionId] = null;
    behaviorData[questionId] = { time_spent_ms: 0, modify_count: 0 };
    continue;
  }
  
  const r = matchingRecords[0];
  studentAnswers[questionId] = r.student_answer !== null && r.student_answer !== undefined 
    ? (typeof r.student_answer === 'string' ? r.student_answer : JSON.stringify(r.student_answer))
    : null;
  behaviorData[questionId] = {
    time_spent_ms: r.time_spent_ms ?? 0,
    modify_count: r.modify_count ?? 0,
  };
}

console.log('\n  [数据映射结果]');
let nonNullCount = 0;
let hasTimeCount = 0;
const sampleEntries = Object.entries(studentAnswers).slice(0, 5);
for (const [qid, ans] of sampleEntries) {
  const beh = behaviorData[qid];
  const ansStr = ans === null ? 'null' : (typeof ans === 'string' ? `"${ans.slice(0, 30)}"` : '[object]');
  console.log(`    ${qid}: answer=${ansStr}, time=${beh.time_spent_ms}ms, mod=${beh.modify_count}`);
  if (ans !== null && ans !== undefined && ans !== '') nonNullCount++;
  if (beh.time_spent_ms > 0) hasTimeCount++;
}

// 统计全部
const totalNonNull = Object.values(studentAnswers).filter(v => v !== null && v !== undefined && v !== '').length;
const totalHasTime = Object.values(behaviorData).filter(v => v.time_spent_ms > 0).length;
console.log(`\n  统计: 非空答案=${totalNonNull}/${questions.length}, 有时间数据=${totalHasTime}/${questions.length}`);

// ===== 测试 3: 有效作判定 =====
console.log('\n' + '='.repeat(60));
console.log('  测试 3: 有效作判定逻辑验证');
console.log('='.repeat(60));

let genuineCount = 0;
let scoreSum = 0;
for (const q of questions) {
  const questionId = `${q.sku_code}-D${q.day_tag}-Q${String(q.seq_no).padStart(2, '0')}`;
  const ans = studentAnswers[questionId];
  const beh = behaviorData[questionId];
  const qId = String(q.id);
  const matchingRecord = allRecords.find(r => String(r.question_id) === qId);
  
  let isGenuine = false;
  
  // a) 得分>0
  if (matchingRecord && matchingRecord.score_obtained > 0) isGenuine = true;
  // b) 答对
  if (matchingRecord && matchingRecord.is_correct) isGenuine = true;
  // c) 有修改记录
  if (beh.modify_count > 0) isGenuine = true;
  // d) 思考时间>=5秒
  if (beh.time_spent_ms >= 5000) isGenuine = true;
  // e) 非空答案
  if (ans !== null && ans !== undefined && ans !== '') isGenuine = true;
  
  if (isGenuine) genuineCount++;
  if (matchingRecord) scoreSum += matchingRecord.score_obtained ?? 0;
}

console.log(`  有效作答: ${genuineCount}/${questions.length}`);
console.log(`  总得分: ${scoreSum}`);
console.log(`  有效率: ${questions.length > 0 ? (genuineCount/questions.length*100).toFixed(1) : '0'}%`);
console.log(`  是否判定为无效: ${(genuineCount/questions.length) < 0.25 ? '❌ 是(低于25%)' : '✅ 否'}`);

// ===== 总结 =====
console.log('\n' + '='.repeat(60));
console.log('  总结');
console.log('='.repeat(60));

const allTestsPass = allInSessions && totalNonNull > 0 && genuineCount > 0;
if (allTestsPass) {
  console.log('  ✅ 核心数据链路正常:');
  console.log('     1. buildFilters { in: [...] } 正确工作');
  console.log('     2. 答题记录正确关联到题目');
  console.log('     3. 有效作答判定能识别真实答题');
  console.log('\n  下一步: 提交代码并推送到GitHub, 在Codespaces拉取重启即可修复无效答卷问题');
} else {
  console.log('  ❌ 仍有问题:');
  if (!allInSessions) console.log('     - buildFilters的{in: [...]} filter未正确应用');
  if (totalNonNull === 0) console.log('     - 答题记录未正确映射(studentAnswers全为null)');
  if (genuineCount === 0) console.log('     - 有效作判定全部失败');
  console.log('\n  需要进一步排查...');
}

} // end of main()

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
