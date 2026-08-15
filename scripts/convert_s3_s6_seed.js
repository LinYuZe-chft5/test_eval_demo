/**
 * convert_s3_s6_seed.js (CommonJS, 纯 Node.js 运行)
 * 将 S3/S6 题库 JSON 转换为种子数据格式
 * 运行：node scripts/convert_s3_s6_seed.js
 */
const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const { createHash } = require('crypto');

// ---------- 转换函数 ----------

function convertAnswerSpec(raw) {
  if (!raw) return null;
  return {
    accept_forms: raw.accept_forms || ['expression'],
    decimal_tolerance: raw.decimal_tolerance ?? (raw.tolerance ?? 0.01),
    allow_pi: raw.allow_pi ?? !(raw.contains_pi ?? false),
    unit: raw.unit ?? null,
  };
}

function convertOptions(raw) {
  if (!raw || raw.length === 0) return null;
  return raw.map(function (o) {
    return {
      key: o.label,
      text: o.text,
      ec_code: o.ec_code ?? null,
    };
  });
}

function convertSteps(raw) {
  if (!raw || raw.length === 0) return null;
  return raw.map(function (s) {
    return {
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
    };
  });
}

function convertQuestion(q, skuCode) {
  var stemHash = createHash('sha256').update(q.stem, 'utf8').digest('hex');
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

function processFile(inputPath, outputPath, skuCode) {
  console.log('\n📖 读取: ' + inputPath);
  var raw = readFileSync(inputPath, 'utf8');
  var data = JSON.parse(raw);

  var rawQuestions = data.questions;
  console.log('📊 共 ' + rawQuestions.length + ' 道题 (' + skuCode + ')');

  // 统计
  var dayCount = {};
  var typeCount = {};
  for (var i = 0; i < rawQuestions.length; i++) {
    var q = rawQuestions[i];
    dayCount[q.day_tag] = (dayCount[q.day_tag] || 0) + 1;
    typeCount[q.q_type] = (typeCount[q.q_type] || 0) + 1;
  }
  console.log('   Day分布: Day1=' + (dayCount[1] || 0) + ', Day2=' + (dayCount[2] || 0) + ', Day3=' + (dayCount[3] || 0));
  console.log('   题型分布: ' + Object.entries(typeCount).map(function (e) { return e[0] + '=' + e[1]; }).join(', '));

  // 转换
  var seedQuestions = rawQuestions.map(function (q) { return convertQuestion(q, skuCode); });

  // 确保输出目录存在
  mkdirSync(dirname(outputPath), { recursive: true });

  // 写入
  writeFileSync(outputPath, JSON.stringify(seedQuestions, null, 2), 'utf8');
  console.log('✅ 已写入: ' + outputPath + ' (' + seedQuestions.length + ' 题)');
}

// ---------- 执行 ----------

var baseDir = join(__dirname, '..');

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
