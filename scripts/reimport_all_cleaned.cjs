#!/usr/bin/env node
/**
 * scripts/reimport_all_cleaned.cjs
 *
 * 清洗后题库全量重导入（S1/S3/S6）
 * 数据库字段与源JSON字段映射：
 *   JSON字段 → DB字段
 *   day → day_tag
 *   seq_in_day → seq_no
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
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const DATA_DIR = path.join(process.cwd(), 'scripts', 'data', 'cleaned');
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

async function deleteQuestions(skuCode) {
  const url = `${API}/questions?sku_code=eq.${encodeURIComponent(skuCode)}`;
  const r = await fetch(url, { method: 'DELETE', headers: HEADERS });
  console.log(`  DEL ${skuCode} → ${r.status}`);
  if (![200, 204].includes(r.status)) throw new Error(`DELETE ${skuCode}: ${r.status} ${await r.text()}`);
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

  const row = {
    sku_code: sku,
    subject: q.subject || 'math',
    day_tag: q.day ?? 1,
    seq_no: q.seq_in_day ?? 1,
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
    cognitive_level: cogLevel,
    literacy_codes: literacyCodes,
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

async function insertBatch(rows) {
  if (rows.length === 0) return;
  const url = `${API}/questions`;
  const r = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(rows),
  });
  if (![200, 201].includes(r.status)) {
    const txt = await r.text();
    console.error(`  ❌ POST questions 失败: ${r.status} ${txt.slice(0, 800)}`);
    throw new Error(`Import failed ${r.status}`);
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

  // 分批导入，每批 25 条
  const BATCH = 25;
  for (let i = 0; i < transformed.length; i += BATCH) {
    const batch = transformed.slice(i, i + BATCH);
    await insertBatch(batch);
    process.stdout.write(`  导入 ${Math.min(i + BATCH, transformed.length)}/${transformed.length}\r`);
    await delay(200);
  }
  console.log(`\n  ✅ 导入完成`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 清洗后题库全量重导入（S1/S3/S6）');
  console.log('='.repeat(60));

  for (const f of FILES) {
    await deleteQuestions(f.sku);
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
