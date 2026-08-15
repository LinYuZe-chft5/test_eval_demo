/**
 * seed_s3_s6.ts
 * 导入 S3(初二) 和 S6(初三) 题库种子数据到 Supabase
 *
 * 读取：
 *   scripts/data/s3_seed.json  → 41题 (S3-01)
 *   scripts/data/s6_seed.json  → 37题 (S6-01)
 *
 * 运行：npx tsx scripts/seed_s3_s6.ts
 */
import { prisma } from '../lib/supabase';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

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
  options: any | null;
  steps: any | null;
  correct_answer: string | null;
  answer_spec: any | null;
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

function computeStemHash(stem: string): string {
  return createHash('sha256').update(stem, 'utf8').digest('hex');
}

async function importSeedFile(filePath: string, label: string) {
  console.log(`\n📖 读取: ${filePath}`);
  const raw = readFileSync(filePath, 'utf8');
  const questions: SeedQuestion[] = JSON.parse(raw);
  console.log(`📊 共 ${questions.length} 道题 (${label})`);

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const q of questions) {
    const tag = `[${label} D${q.day_tag}-${String(q.seq_no).padStart(2, '0')}] ${q.kp_code}`;
    try {
      const stemHash = computeStemHash(q.stem);
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
          options: q.options,
          steps: q.steps,
          correctAnswer: q.correct_answer,
          answerSpec: q.answer_spec,
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
          status: 'active',
          stemHash,
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
          options: q.options,
          steps: q.steps,
          correctAnswer: q.correct_answer,
          answerSpec: q.answer_spec,
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
          status: 'active',
          stemHash,
        },
      });
      success++;
      console.log(`  ✅ ${tag}`);
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${tag}: ${msg}`);
      console.error(`  ❌ ${tag}: ${msg}`);
    }
  }

  console.log(`\n📋 ${label} 导入统计: 成功=${success}, 失败=${failed}`);
  if (errors.length > 0) {
    console.log('⚠️ 失败详情:');
    for (const e of errors) console.log(`  - ${e}`);
  }
  return { success, failed };
}

async function main() {
  const baseDir = join(__dirname, 'data');

  const s3Result = await importSeedFile(
    join(baseDir, 's3_seed.json'),
    'S3-01',
  );

  const s6Result = await importSeedFile(
    join(baseDir, 's6_seed.json'),
    'S6-01',
  );

  const totalSuccess = s3Result.success + s6Result.success;
  const totalFailed = s3Result.failed + s6Result.failed;

  console.log('\n' + '='.repeat(60));
  console.log(`🎉 全部完成！S3+S6 共导入 ${totalSuccess} 题，失败 ${totalFailed} 题`);
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('💥 脚本执行出错:', err);
  process.exitCode = 1;
});
