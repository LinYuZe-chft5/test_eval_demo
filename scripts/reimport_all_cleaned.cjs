#!/usr/bin/env node
/**
 * scripts/reimport_all_cleaned.cjs
 *
 * 清洗后题库全量重导入（S1/S3/S6）
 * 数据库字段与源JSON字段映射：
 *   JSON字段 → DB字段
 *   day_tag → day_tag   (注意：s3_seed.json 使用 day_tag/seq_no)
 *   seq_no → seq_no
 *   knowledge_points[0] → kp_code
 *   knowledge_points[1] → kp_related
 *   error_label_pool → ec_mapping
 *   difficulty → difficulty_est
 *   time_limit → expected_time_sec
 *   stem → stem (auto sha256 → stem_hash)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Manual .env loader (avoid dotenv dependency)
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

const DATA_DIR = path.join(process.cwd(), 'scripts', 'data');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 缺少 Supabase 环境变量！');
  process.exit(1);
}

const API = `${SUPABASE_URL}/rest/v1`;
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

const FILES = [
  { file: 'questions_seed.json', sku: 'S1_XIAOSHENGCHU_MATH' },
  { file: 's3_seed.json', sku: 'S3-01' },
  { file: 's6_seed.json', sku: 'S6-01' },
];

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function sha256(s) {
  return crypto.createHash('sha256').update(s || '').digest('hex');
}

async function deleteQuestionsBySQL(skuCode) {
  // 使用 RPC 执行原生 SQL DELETE（绕过 PostgREST HTTP 的事务隔离问题）
  const sql = `DELETE FROM questions WHERE sku_code = '${skuCode.replace(/'/g, "''")}' RETURNING COUNT(*);`;
  const url = `${API}/rpc/pg_query`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (r.status === 404) {
    // RPC 不存在，改用 DELETE API 并强制等待
    return deleteQuestionsByAPI(skuCode);
  }
  if (![200, 201].includes(r.status)) {
    console.log(`  RPC 删除失败 (${r.status})，改用 API 删除`);
    return deleteQuestionsByAPI(skuCode);
  }
  console.log(`  SQL DELETE ${skuCode} → ${r.status}`);
  
  // 验证：直接查询确认
  await delay(500);
  const verify = await fetch(`${API}/questions?sku_code=eq.${encodeURIComponent(skuCode)}&select=id&limit=1`, {
    headers: HEADERS,
  });
  if (verify.status === 200) {
    const data = await verify.json();
    if (Array.isArray(data) && data.length === 0) {
      console.log(`  ✅ 已清空`);
      return;
    }
  }
  // 强制重试删除
  console.log(`  ⚠️ 数据未清空，强制重试...`);
  return deleteQuestionsByAPI(skuCode);
}

async function deleteQuestionsByAPI(skuCode) {
  // 多次删除尝试，确保数据清空
  for (let attempt = 0; attempt < 3; attempt++) {
    const url = `${API}/questions?sku_code=eq.${encodeURIComponent(skuCode)}`;
    const r = await fetch(url, { method: 'DELETE', headers: HEADERS });
    console.log(`  DEL ${skuCode} (尝试${attempt+1}) → ${r.status}`);
    await delay(500);
    
    // 验证
    const verify = await fetch(`${API}/questions?sku_code=eq.${encodeURIComponent(skuCode)}&select=id&limit=1`, {
      headers: HEADERS,
    });
    const data = await verify.json();
    if (Array.isArray(data) && data.length === 0) {
      console.log(`  ✅ 已清空`);
      return;
    }
    console.log(`  ⏳ 仍有 ${Array.isArray(data) ? data.length : '?'} 题，重试...`);
  }
  throw new Error(`删除失败：${skuCode} 多次重试后仍有数据`);
}

/**
 * 字段映射：源 JSON → 数据库列
 * 兼容两种数据格式：
 *   新格式: ec_mapping=["EC-M1"], kp_code, kp_related
 *   旧格式: error_label_pool=[{code,label,desc}], knowledge_points={primary:{code},secondary:{code}}
 */
function transformRow(q, sku) {
  // 知识点：兼容新旧格式
  let kpCode = q.kp_code || null;
  let kpRelated = q.kp_related || null;
  if (!kpCode && q.knowledge_points) {
    if (typeof q.knowledge_points === 'object' && q.knowledge_points.primary) {
      kpCode = q.knowledge_points.primary.code || null;
    } else if (Array.isArray(q.knowledge_points)) {
      kpCode = q.knowledge_points[0] || null;
      kpRelated = q.knowledge_points[1] || null;
    }
    if (!kpRelated && q.knowledge_points && q.knowledge_points.secondary) {
      kpRelated = q.knowledge_points.secondary.code || null;
    }
  }
  
  // 错因编码：兼容新旧格式
  let ecMapping = q.ec_mapping || null;
  if (!ecMapping && q.error_label_pool && Array.isArray(q.error_label_pool)) {
    ecMapping = q.error_label_pool
      .map(item => (typeof item === 'object' ? item.code : item))
      .filter(code => code && code.length <= 8);
  }
  
  // 清理：确保每个 ec_mapping 元素 <= 8 字符
  if (Array.isArray(ecMapping)) {
    ecMapping = ecMapping.filter(c => c && String(c).length <= 8);
  }
  
  // cognitive_level 限制 <= 4 字符
  let cogLevel = q.cognitive_level || 'L2';
  if (cogLevel.length > 4) cogLevel = cogLevel.slice(0, 4);
  
  // literacy_codes：确保每个元素 <= 32 字符
  let literacyCodes = Array.isArray(q.literacy_codes) ? q.literacy_codes : ['S1'];
  literacyCodes = literacyCodes.filter(c => String(c).length <= 32);
  
  // radar_dimensions：从题库数据中读取（对象数组格式）
  let radarDimensions = Array.isArray(q.radar_dimensions) ? q.radar_dimensions : [];
  
  // kp_name：知识点中文名称映射
  const KP_NAME_MAP = {
    'KP-P.4': '数与式',
    'KP-P.5': '方程与不等式',
    'KP-P.6': '函数',
    'KP-P.7': '图形与几何',
    'KP-P.8': '统计与概率',
    'KP-P.9': '综合应用',
    'KP-07.02': '二元一次方程组',
    'KP-06.04': '一元二次方程',
    'KP-08.04': '反比例函数',
    'KP-12.02': '全等三角形',
  };
  const kpName = q.kp_name || KP_NAME_MAP[kpCode] || kpCode;

  const row = {
    sku_code: sku,
    subject: q.subject || 'math',
    // IMPORTANT: seed JSON uses day_tag & seq_no, NOT day & seq_in_day
    day_tag: q.day_tag ?? q.day ?? 1,
    seq_no: q.seq_no ?? q.seq_in_day ?? 1,
    q_type: q.q_type || 'choice',
    is_warmup: !!q.is_warmup,
    is_anchor: !!q.is_anchor,

    stem: q.stem || '',
    image_url: q.image_url || null,
    options: Array.isArray(q.options) ? q.options : null,
    steps: Array.isArray(q.steps) ? q.steps : null,
    correct_answer: q.correct_answer || null,
    answer_spec: q.answer_spec || null,
    score: q.score || 1,
    solution: q.solution || q.stem || '',

    kp_code: kpCode || 'KP-unknown',
    kp_related: kpRelated,
    kp_name: kpName,
    cognitive_level: cogLevel,
    literacy_codes: literacyCodes,
    radar_dimensions: radarDimensions,
    ec_mapping: ecMapping,
    difficulty_est: q.difficulty || q.difficulty_est || 0.5,
    discrimination_est: null,
    expected_time_sec: q.time_limit || q.expected_time_sec || 300,
    pairing_id: q.pairing_id || null,
    parallel_group_id: q.parallel_group_id || null,
    variant_of: null,
    improvement_tip: q.improvement_tip || null,
    variant_stem: q.variant_stem || null,
    variant_answer: q.variant_answer || null,

    status: 'active',
    exposure_count: 0,
    measured_p: null,
    measured_d: null,
    stem_hash: sha256(q.stem || ''),
    version: 'v1.0',
    reviewer: null,
  };

  return row;
}

async function insertBatchViaRPC(rows) {
  // 使用 RPC 函数实现真正的 UPSERT
  // 只传 questions_data，避免 PostgREST 解析下划线参数名的问题
  if (rows.length === 0) return;
  const url = `${API}/rpc/batch_upsert_questions`;
  
  const body = {
    questions_data: rows,
  };
  
  const r = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (![200, 201].includes(r.status)) {
    const txt = await r.text();
    console.error(`  ❌ RPC 导入失败: ${r.status} ${txt.slice(0, 800)}`);
    
    if (r.status === 404) {
      console.error(`  💡 请先在 Supabase SQL Editor 执行 scripts/create_upsert_rpc.sql`);
    }
    throw new Error(`Import failed ${r.status}`);
  }
  
  // RPC 返回 INT，直接显示计数
  try {
    const count = await r.json();
    process.stdout.write(`  (已处理 ${count} 题)`);
  } catch {
    process.stdout.write(`  (已处理)`);
  }
}

async function importFile({ file, sku }) {
  console.log(`\n📦 导入 ${file} (SKU=${sku}) ...`);
  const filePath = path.join(DATA_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️ 文件不存在，跳过: ${filePath}`);
    return;
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const questions = raw.questions ?? (Array.isArray(raw) ? raw : []);
  console.log(`  共 ${questions.length} 题`);

  const transformed = questions.map(q => transformRow(q, sku));

  // 分批导入，每批 25 条（使用 RPC UPSERT 避免重复键冲突）
  const BATCH = 25;
  for (let i = 0; i < transformed.length; i += BATCH) {
    const batch = transformed.slice(i, i + BATCH);
    await insertBatchViaRPC(batch);
    process.stdout.write(`  导入 ${Math.min(i + BATCH, transformed.length)}/${transformed.length}\r`);
    await delay(150);
  }
  console.log(`\n  ✅ 导入完成`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 清洗后题库全量重导入（S1/S3/S6）');
  console.log('   使用 RPC UPSERT 模式：冲突时自动更新，无需先清空');
  console.log('='.repeat(60));

  for (const f of FILES) {
    await importFile(f);
  }

  // 验证
  console.log('\n📊 导入验证：');
  const verify = await fetch(`${API}/questions?select=sku_code&limit=0`, {
    headers: { ...HEADERS, Prefer: 'count=exact' },
  });
  const total = verify.headers.get('content-range')?.split('/')[1] ?? '?';
  for (const f of FILES) {
    const r = await fetch(`${API}/questions?sku_code=eq.${encodeURIComponent(f.sku)}&limit=0`, {
      headers: { ...HEADERS, Prefer: 'count=exact' },
    });
    const n = r.headers.get('content-range')?.split('/')[1] ?? '?';
    console.log(`  ${f.sku}: ${n} 题`);
  }
  console.log(`  合计: ${total} 题`);
  console.log('\n✅ 全部导入完成！');
}

main().catch(e => { console.error(e); process.exit(1); });
