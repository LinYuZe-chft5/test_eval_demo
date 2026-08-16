#!/usr/bin/env node
/**
 * scripts/reimport_all_cleaned.cjs
 * 
 * 重新导入清洗后的题库到 Supabase
 * 
 * 步骤：
 *  1. 通过 PostgREST REST API 删除旧的 questions
 *  2. 批量导入 scripts/data/cleaned/*.json
 * 
 * 用法：node scripts/reimport_all_cleaned.cjs
 */

const fs = require('fs');
const path = require('path');
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

async function deleteQuestions(skuCode) {
  const url = `${API}/questions?sku_code=eq.${encodeURIComponent(skuCode)}`;
  const r = await fetch(url, { method: 'DELETE', headers: HEADERS });
  console.log(`  DEL ${skuCode} → ${r.status}`);
  if (![200, 204].includes(r.status)) throw new Error(`DELETE ${skuCode}: ${r.status} ${await r.text()}`);
}

// 将 camelCase JSON 字段转换为 snake_case DB 列 + 数组字面值处理
const SNAKE_MAP = {
  id: 'id', sku_code: 'sku_code', q_type: 'q_type', day: 'day',
  seq_in_day: 'seq_in_day', stem: 'stem', options: 'options',
  steps: 'steps', correct_answer: 'correct_answer', answer_spec: 'answer_spec',
  score: 'score', error_label_pool: 'error_label_pool',
  ec_code_primary: 'ec_code_primary', ec_code_secondary: 'ec_code_secondary',
  knowledge_points: 'knowledge_points', method_cards: 'method_cards',
  difficulty: 'difficulty', is_warmup: 'is_warmup', is_anchor: 'is_anchor',
  image_url: 'image_url', solution: 'solution', improvement_tip: 'improvement_tip',
  variant_stem: 'variant_stem', variant_answer: 'variant_answer',
  time_limit: 'time_limit', score_spec: 'score_spec', prob_for: 'prob_for',
  radar_tags: 'radar_tags', kp_deps: 'kp_deps',
};

const PG_ARRAY_FIELDS = new Set([
  'error_label_pool', 'ec_code_primary', 'ec_code_secondary',
  'knowledge_points', 'method_cards', 'options', 'steps',
  'kp_deps', 'radar_tags',
]);

function toSnake(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const col = SNAKE_MAP[k] ?? k;
    if (v === undefined) continue;
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      out[col] = null;
      continue;
    }
    if (PG_ARRAY_FIELDS.has(col)) {
      if (Array.isArray(v)) {
        // JSON数组字段：PostgREST直接接受JSON数组即可（类型为jsonb）
        out[col] = v;
      } else {
        out[col] = v;
      }
    } else {
      out[col] = v;
    }
  }
  return out;
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
    console.error(`  ❌ POST questions 失败: ${r.status} ${txt.slice(0, 500)}`);
    throw new Error(`Import failed ${r.status}`);
  }
}

async function importFile({ file, sku }) {
  console.log(`\n📦 导入 ${file} (SKU=${sku}) ...`);
  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  const questions = raw.questions ?? (Array.isArray(raw) ? raw : []);
  console.log(`  共 ${questions.length} 题`);

  const transformed = questions.map(q => {
    const row = toSnake(q);
    if (!row.sku_code) row.sku_code = sku;
    return row;
  });

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
