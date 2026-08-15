/**
 * reimport_all_data.cjs
 * 全量题库重新导入脚本（S1 + S3 + S6）
 * 
 * 使用方法（在Codespaces终端执行）：
 *   node scripts/reimport_all_data.cjs
 * 
 * 前置条件：
 *   1. 已清空数据库（执行clean SQL脚本）
 *   2. .env 文件已正确配置
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 手动加载 .env
function loadEnvFile() {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
  ];
  
  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine.startsWith('#')) continue;
          const equalIndex = trimmedLine.indexOf('=');
          if (equalIndex === -1) continue;
          const key = trimmedLine.substring(0, equalIndex).trim();
          let value = trimmedLine.substring(equalIndex + 1).trim();
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.substring(1, value.length - 1);
          }
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
        console.log(`[env] 已加载: ${envPath}`);
        return;
      }
    } catch (err) {
      console.warn(`[env] 无法读取 ${envPath}:`, err.message);
    }
  }
}

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ 环境变量缺失！请配置 .env 文件');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? '已设置' : '未设置');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '已设置' : '未设置');
  process.exit(1);
}

const API_BASE = `${SUPABASE_URL}/rest/v1`;

async function supabaseRequest(path, method, body) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation,resolution=merge-duplicates',
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function computeStemHash(stem) {
  return crypto.createHash('sha256').update(stem, 'utf8').digest('hex');
}

// 将camelCase转为snake_case
function toSnakeCase(str) {
  const specialMap = {
    skuCode: 'sku_code', dayTag: 'day_tag', seqNo: 'seq_no',
    qType: 'q_type', isWarmup: 'is_warmup', isAnchor: 'is_anchor',
    imageUrl: 'image_url', correctAnswer: 'correct_answer',
    answerSpec: 'answer_spec', cognitiveLevel: 'cognitive_level',
    literacyCodes: 'literacy_codes', ecMapping: 'ec_mapping',
    difficultyEst: 'difficulty_est', discriminationEst: 'discrimination_est',
    expectedTimeSec: 'expected_time_sec', pairingId: 'pairing_id',
    parallelGroupId: 'parallel_group_id', variantOf: 'variant_of',
    improvementTip: 'improvement_tip', variantStem: 'variant_stem',
    variantAnswer: 'variant_answer', stemHash: 'stem_hash',
    createdAt: 'created_at', updatedAt: 'updated_at',
    dayModules: 'day_modules', kpCode: 'kp_code', kpRelated: 'kp_related',
  };
  if (specialMap[str]) return specialMap[str];
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function keysToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(item => keysToSnakeCase(item));
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[toSnakeCase(key)] = keysToSnakeCase(value);
    }
    return result;
  }
  return obj;
}

async function importQuestion(q) {
  const stemHash = computeStemHash(q.stem);
  
  const data = {
    sku_code: q.sku_code,
    subject: q.subject,
    day_tag: q.day_tag,
    seq_no: q.seq_no,
    q_type: q.q_type,
    is_warmup: q.is_warmup || false,
    is_anchor: q.is_anchor || false,
    stem: q.stem,
    image_url: q.image_url || null,
    options: q.options || null,
    steps: q.steps || null,
    correct_answer: q.correct_answer || null,
    answer_spec: q.answer_spec || null,
    score: q.score,
    solution: q.solution,
    kp_code: q.kp_code,
    kp_related: q.kp_related || null,
    cognitive_level: q.cognitive_level,
    literacy_codes: q.literacy_codes || [],
    ec_mapping: q.ec_mapping || [],
    difficulty_est: q.difficulty_est,
    discrimination_est: q.discrimination_est || null,
    expected_time_sec: q.expected_time_sec,
    pairing_id: q.pairing_id || null,
    parallel_group_id: q.parallel_group_id || null,
    variant_of: q.variant_of || null,
    improvement_tip: q.improvement_tip || null,
    variant_stem: q.variant_stem || null,
    variant_answer: q.variant_answer || null,
    status: 'active',
    stem_hash: stemHash,
  };

  // 检查是否已存在
  try {
    const existing = await supabaseRequest(
      `/questions?sku_code=eq.${q.sku_code}&day_tag=eq.${q.day_tag}&seq_no=eq.${q.seq_no}&select=id`,
      'GET'
    );
    
    if (existing && existing.length > 0) {
      // 更新
      await supabaseRequest(
        `/questions?sku_code=eq.${q.sku_code}&day_tag=eq.${q.day_tag}&seq_no=eq.${q.seq_no}`,
        'PATCH',
        data
      );
      return 'updated';
    } else {
      // 创建
      await supabaseRequest('/questions', 'POST', data);
      return 'created';
    }
  } catch (err) {
    throw err;
  }
}

async function importSeedFile(filePath, label) {
  console.log(`\n📖 读取种子文件: ${path.basename(filePath)}`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    return { created: 0, updated: 0, failed: 0 };
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const questions = JSON.parse(raw);
  console.log(`📊 题库题数: ${questions.length}`);

  let created = 0, updated = 0, failed = 0;
  const errors = [];

  for (const q of questions) {
    const label_str = `[${q.sku_code} D${q.day_tag} Q${String(q.seq_no).padStart(2, '0')}]`;
    try {
      const result = await importQuestion(q);
      if (result === 'created') {
        created++;
        console.log(`  ✅ ${label_str} 新增`);
      } else {
        updated++;
        console.log(`  🔄 ${label_str} 更新`);
      }
    } catch (err) {
      failed++;
      errors.push(`${label_str}: ${err.message}`);
      console.error(`  ❌ ${label_str} 失败: ${err.message}`);
    }
  }

  console.log(`\n📈 [${label}] 完成: 新增${created}, 更新${updated}, 失败${failed}`);
  return { created, updated, failed, errors };
}

async function main() {
  console.log('='.repeat(60));
  console.log('📚 全量题库重新导入脚本 (S1 + S3 + S6)');
  console.log('='.repeat(60));
  console.log(`🔗 Supabase URL: ${SUPABASE_URL}`);

  const dataDir = path.join(__dirname, 'data');
  
  const files = [
    { file: path.join(dataDir, 'questions_seed.json'), label: 'S1 (初一)' },
    { file: path.join(dataDir, 's3_seed.json'), label: 'S3 (初二)' },
    { file: path.join(dataDir, 's6_seed.json'), label: 'S6 (初三)' },
  ];

  let totalCreated = 0, totalUpdated = 0, totalFailed = 0;

  for (const { file, label } of files) {
    const { created, updated, failed } = await importSeedFile(file, label);
    totalCreated += created;
    totalUpdated += updated;
    totalFailed += failed;
  }

  // 验证数据
  console.log('\n📊 数据验证:');
  const skus = [
    { code: 'S1', label: 'S1 (初一)' },
    { code: 'S3-01', label: 'S3 (初二)' },
    { code: 'S6-01', label: 'S6 (初三)' },
  ];
  
  for (const { code, label } of skus) {
    try {
      const count = await supabaseRequest(
        `/questions?sku_code=eq.${code}&status=eq.active&select=id`,
        'GET'
      );
      console.log(`  ${label}: ${count.length} 道题 (active)`);
    } catch (err) {
      console.log(`  ${label}: 查询失败 - ${err.message}`);
    }
  }

  // 总数
  try {
    const total = await supabaseRequest('/questions?select=id', 'GET');
    console.log(`\n📈 数据库题库总计: ${total.length} 道题`);
  } catch (err) {
    console.log('\n📈 数据库题库总计: 查询失败');
  }

  console.log('\n' + '='.repeat(60));
  console.log(`🎉 导入完成! 新增${totalCreated}, 更新${totalUpdated}, 失败${totalFailed}`);
  
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 脚本执行出错:', err);
  process.exit(1);
});
