/**
 * convert_s3_s6_seed.ts
 * 将 S3/S6 题库 JSON 转换为种子数据格式（与 questions_seed.json 结构一致）
 *
 * 输入：
 *   进阶开发资料/Codex_05_S3-01_七年级数学_七升八.json  → 41题
 *   进阶开发资料/Codex_05_S6-01_七年级数学_中考一轮.json → 37题
 *
 * 输出：
 *   scripts/data/s3_seed.json  → 41题（sku_code=S3-01）
 *   scripts/data/s6_seed.json  → 37题（sku_code=S6-01）
 *
 * 运行：npx tsx scripts/convert_s3_s6_seed.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

// ---------- 类型定义 ----------

interface RawOption {
  label: string;
  text: string;
  ec_code: string | null;
  is_correct?: boolean;
}

interface RawAnswerSpec {
  accept_forms: string[];
  tolerance?: number | null;
  contains_pi?: boolean;
  unit?: string | null;
  decimal_tolerance?: number;
  allow_pi?: boolean;
}

interface RawStep {
  seq: number;
  prompt: string;
  answer: string;
  answer_spec: RawAnswerSpec;
  score: number;
  ec_mapping: string[];
}

interface RawQuestion {
  question_id: string;
  day_tag: number;
  seq_no: number;
  q_type: string;
  is_warmup: boolean;
  stem: string;
  image_url: string | null;
  correct_answer: string;
  score: number;
  solution: string;
  kp_code: string;
  kp_related: string | null;
  cognitive_level: string;
  literacy_codes: string[];
  ec_mapping: string[];
  difficulty_est: number;
  expected_time_sec: number;
  pairing_id: string | null;
  parallel_group_id: string | null;
  variant_of_seq: number | null;
  improvement_tip: string | null;
  variant_stem: string | null;
  variant_answer: string | null;
  options?: RawOption[];
  steps?: RawStep[];
  answer_spec?: RawAnswerSpec;
}

interface SeedOption {
  key: string;
  text: string;
  ec_code: string | null;
}

interface SeedAnswerSpec {
  accept_forms: string[];
  decimal_tolerance: number;
  allow_pi: boolean;
  unit: string | null;
}

interface SeedStep {
  seq: number;
  prompt: string;
  answer: string;
  answer_spec: SeedAnswerSpec;
  score: number;
  ec_mapping: string[];
}

interface SeedQuestion {
  sku_code: string;
  subject: string;
  day_tag: number;
  seq_no: number;
  q_type: string;
  is_warmup: boolean;
  is_anchor: boolean;
  stem: string;
  image_url: string | null;
  options: SeedOption[] | null;
  steps: SeedStep[] | null;
  correct_answer: string | null;
  answer_spec: SeedAnswerSpec | null;
  score: number;
  solution: string;
  kp_code: string;
  kp_related: string | null;
  cognitive_level: string;
  literacy_codes: string[];
  ec_mapping: string[];
  difficulty_est: number;
  discrimination_est: number | null;
  expected_time_sec: number;
  pairing_id: string | null;
  parallel_group_id: string | null;
  variant_of: number | null;
  improvement_tip: string | null;
  variant_stem: string | null;
  variant_answer: string | null;
  status: string;
  stem_hash: string;
}

// ---------- 转换函数 ----------

function convertAnswerSpec(raw: RawAnswerSpec | undefined): SeedAnswerSpec | null {
  if (!raw) return null;
  return {
    accept_forms: raw.accept_forms || ['expression'],
    decimal_tolerance: raw.decimal_tolerance ?? (raw.tolerance ?? 0.01),
    allow_pi: raw.allow_pi ?? !(raw.contains_pi ?? false),
    unit: raw.unit ?? null,
  };
}

function convertOptions(raw: RawOption[] | undefined): SeedOption[] | null {
  if (!raw || raw.length === 0) return null;
  return raw.map((o) => ({
    key: o.label,
    text: o.text,
    ec_code: o.ec_code ?? null,
  }));
}

function convertSteps(raw: RawStep[] | undefined): SeedStep[] | null {
  if (!raw || raw.length === 0) return null;
  return raw.map((s) => ({
    seq: s.seq,
    prompt: s.prompt,
    answer: s.answer,
    answer_spec: convertAnswerSpec(s.answer_spec) ?? {
      accept_forms: ['expression'],
      decimal_tolerance: 0.01,
      allow_pi: false,
      unit: null,
    },
    score: s.score,
    ec_mapping: s.ec_mapping || [],
  }));
}

function convertQuestion(q: RawQuestion, skuCode: string): SeedQuestion {
  const stemHash = createHash('sha256').update(q.stem, 'utf8').digest('hex');
  return {
    sku_code: skuCode,
    subject: 'math',
    day_tag: q.day_tag,
    seq_no: q.seq_no,
    q_type: q.q_type,
    is_warmup: q.is_warmup,
    is_anchor: false,
    stem: q.stem,
    image_url: q.image_url,
    options: convertOptions(q.options),
    steps: convertSteps(q.steps),
    correct_answer: q.correct_answer,
    answer_spec: convertAnswerSpec(q.answer_spec),
    score: q.score,
    solution: q.solution,
    kp_code: q.kp_code,
    kp_related: q.kp_related,
    cognitive_level: q.cognitive_level,
    literacy_codes: q.literacy_codes,
    ec_mapping: q.ec_mapping,
    difficulty_est: q.difficulty_est,
    discrimination_est: null,
    expected_time_sec: q.expected_time_sec,
    pairing_id: q.pairing_id,
    parallel_group_id: q.parallel_group_id,
    variant_of: q.variant_of_seq,
    improvement_tip: q.improvement_tip,
    variant_stem: q.variant_stem,
    variant_answer: q.variant_answer,
    status: 'active',
    stem_hash: stemHash,
  };
}

// ---------- 主逻辑 ----------

function processFile(inputPath: string, outputPath: string, skuCode: string) {
  console.log(`\n📖 读取: ${inputPath}`);
  const raw = readFileSync(inputPath, 'utf8');
  const data = JSON.parse(raw);

  const rawQuestions: RawQuestion[] = data.questions;
  console.log(`📊 共 ${rawQuestions.length} 道题 (${skuCode})`);

  // 统计
  const dayCount: Record<number, number> = {};
  const typeCount: Record<string, number> = {};
  for (const q of rawQuestions) {
    dayCount[q.day_tag] = (dayCount[q.day_tag] || 0) + 1;
    typeCount[q.q_type] = (typeCount[q.q_type] || 0) + 1;
  }
  console.log(`   Day分布: Day1=${dayCount[1] || 0}, Day2=${dayCount[2] || 0}, Day3=${dayCount[3] || 0}`);
  console.log(`   题型分布: ${Object.entries(typeCount).map(([k, v]) => `${k}=${v}`).join(', ')}`);

  // 转换
  const seedQuestions: SeedQuestion[] = rawQuestions.map((q) => convertQuestion(q, skuCode));

  // 确保输出目录存在
  mkdirSync(dirname(outputPath), { recursive: true });

  // 写入
  writeFileSync(outputPath, JSON.stringify(seedQuestions, null, 2), 'utf8');
  console.log(`✅ 已写入: ${outputPath} (${seedQuestions.length} 题)`);
}

// ---------- 执行 ----------

const baseDir = join(__dirname, '..');

processFile(
  join(baseDir, '进阶开发资料', 'Codex_05_题库导入全量包_S3-01_S6-01', 'Codex_05_S3-01_七年级数学_七升八.json'),
  join(baseDir, 'scripts', 'data', 's3_seed.json'),
  'S3-01',
);

processFile(
  join(baseDir, '进阶开发资料', 'Codex_05_题库导入全量包_S3-01_S6-01', 'Codex_05_S6-01_七年级数学_中考一轮.json'),
  join(baseDir, 'scripts', 'data', 's6_seed.json'),
  'S6-01',
);

console.log('\n🎉 转换完成！');
