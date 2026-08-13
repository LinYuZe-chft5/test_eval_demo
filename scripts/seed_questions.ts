/**
 * seed_questions.ts
 * 题库种子数据导入脚本
 *
 * 读取 scripts/data/questions_seed.json，计算 stem_hash（SHA256），
 * 以 (sku_code, day_tag, seq_no) 为唯一键 upsert 到 questions 表。
 *
 * 运行前必须先执行 prisma db pull && prisma generate 生成 Prisma Client。
 * 用法：npm run seed  或  npx tsx scripts/seed_questions.ts
 */
import { prisma } from '../lib/supabase';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

// ---------- 种子数据类型定义（与 questions_seed.json 结构一致） ----------

interface AnswerSpec {
  accept_forms: string[];
  decimal_tolerance?: number;
  allow_pi: boolean;
  unit?: string | null;
}

interface ChoiceOption {
  key: string;
  text: string;
  ec_code: string | null;
}

interface StepItem {
  seq: number;
  prompt: string;
  answer: string;
  answer_spec: AnswerSpec;
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
  options: ChoiceOption[] | null;
  steps: StepItem[] | null;
  correct_answer: string | null;
  answer_spec: AnswerSpec | null;
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

// ---------- 统计计数 ----------

interface ImportStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

// ---------- 主逻辑 ----------

/**
 * 计算题干的 SHA256 哈希值（用于导入查重）
 */
function computeStemHash(stem: string): string {
  return createHash('sha256').update(stem, 'utf8').digest('hex');
}

async function main() {
  // 1. 读取种子 JSON
  const seedPath = join(__dirname, 'data', 'questions_seed.json');
  console.log(`📖 读取种子文件: ${seedPath}`);

  let rawQuestions: SeedQuestion[];
  try {
    const raw = readFileSync(seedPath, 'utf8');
    rawQuestions = JSON.parse(raw) as SeedQuestion[];
  } catch (err) {
    console.error('❌ 读取或解析 questions_seed.json 失败:', err);
    throw err;
  }

  console.log(`📊 共读取 ${rawQuestions.length} 道题目\n`);

  const stats: ImportStats = {
    total: rawQuestions.length,
    success: 0,
    failed: 0,
    skipped: 0,
  };

  const errors: string[] = [];

  // 2. 逐题导入
  for (const q of rawQuestions) {
    const label = `[D${q.day_tag}-${String(q.seq_no).padStart(2, '0')}] ${q.kp_code}`;

    try {
      // 计算真实的 stem_hash（覆盖 JSON 中的占位符）
      const stemHash = computeStemHash(q.stem);

      // 确保 status='active'
      const status = 'active';

      // upsert：以 (sku_code, day_tag, seq_no) 为唯一键
      await prisma.questions.upsert({
        where: {
          skuCode_dayTag_seqNo: {
            skuCode: q.sku_code,
            dayTag: q.day_tag,
            seqNo: q.seq_no,
          },
        },
        update: {
          subject: q.subject,
          qType: q.q_type,
          isWarmup: q.is_warmup,
          isAnchor: q.is_anchor,
          stem: q.stem,
          imageUrl: q.image_url,
          options: q.options as any,
          steps: q.steps as any,
          correctAnswer: q.correct_answer,
          answerSpec: q.answer_spec as any,
          score: q.score,
          solution: q.solution,
          kpCode: q.kp_code,
          kpRelated: q.kp_related,
          cognitiveLevel: q.cognitive_level,
          literacyCodes: q.literacy_codes,
          ecMapping: q.ec_mapping,
          difficultyEst: q.difficulty_est,
          discriminationEst: q.discrimination_est,
          expectedTimeSec: q.expected_time_sec,
          pairingId: q.pairing_id,
          parallelGroupId: q.parallel_group_id,
          variantOf: q.variant_of,
          improvementTip: q.improvement_tip,
          variantStem: q.variant_stem,
          variantAnswer: q.variant_answer,
          status: status,
          stemHash: stemHash,
          updatedAt: new Date(),
        },
        create: {
          skuCode: q.sku_code,
          subject: q.subject,
          dayTag: q.day_tag,
          seqNo: q.seq_no,
          qType: q.q_type,
          isWarmup: q.is_warmup,
          isAnchor: q.is_anchor,
          stem: q.stem,
          imageUrl: q.image_url,
          options: q.options as any,
          steps: q.steps as any,
          correctAnswer: q.correct_answer,
          answerSpec: q.answer_spec as any,
          score: q.score,
          solution: q.solution,
          kpCode: q.kp_code,
          kpRelated: q.kp_related,
          cognitiveLevel: q.cognitive_level,
          literacyCodes: q.literacy_codes,
          ecMapping: q.ec_mapping,
          difficultyEst: q.difficulty_est,
          discriminationEst: q.discrimination_est,
          expectedTimeSec: q.expected_time_sec,
          pairingId: q.pairing_id,
          parallelGroupId: q.parallel_group_id,
          variantOf: q.variant_of,
          improvementTip: q.improvement_tip,
          variantStem: q.variant_stem,
          variantAnswer: q.variant_answer,
          status: status,
          stemHash: stemHash,
        },
      });

      stats.success++;
      console.log(`  ✅ ${label} 导入成功`);
    } catch (err) {
      stats.failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${errMsg}`);
      console.error(`  ❌ ${label} 导入失败: ${errMsg}`);
    }
  }

  // 3. 输出统计报告
  console.log('\n' + '='.repeat(60));
  console.log('📋 导入统计报告');
  console.log('='.repeat(60));
  console.log(`  总数:   ${stats.total}`);
  console.log(`  成功:   ${stats.success}`);
  console.log(`  失败:   ${stats.failed}`);
  console.log(`  跳过:   ${stats.skipped}`);

  if (errors.length > 0) {
    console.log('\n⚠️ 失败详情:');
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
  }

  console.log('\n' + (stats.failed === 0 ? '🎉 全部导入成功！' : `⚠️ 有 ${stats.failed} 题导入失败，请查看上方详情。`));
}

main()
  .catch((err) => {
    console.error('💥 脚本执行出错:', err);
    process.exitCode = 1;
  });
