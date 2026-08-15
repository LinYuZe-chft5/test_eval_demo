/**
 * scripts/reimport_all_data.ts
 * 一键重新导入所有题库数据（S1 + S3 + S6）
 * 
 * 使用方法（在Codespaces终端执行）：
 *   npx tsx scripts/reimport_all_data.ts
 * 
 * 前置条件：
 *   1. 已在Supabase SQL Editor中执行 _clean_db_v2.sql 清空数据库
 *   2. .env 文件已正确配置
 */

import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

interface SeedQuestion {
  sku_code: string;
  subject: string;
  day_tag: number;
  seq_no: number;
  q_type: 'choice' | 'fill' | 'step';
  is_warmup: boolean;
  is_anchor: boolean;
  stem: string;
  image_url: string | null;
  options: any | null;
  steps: any | null;
  correct_answer: string;
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
  improvement_tip: string;
  variant_stem: string;
  variant_answer: string;
  status: string;
  stem_hash: string;
}

async function importSeedFile(filePath: string, skuLabel: string): Promise<number> {
  console.log(`\n📖 读取种子文件: ${path.basename(filePath)}`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    return 0;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const questions: SeedQuestion[] = JSON.parse(raw);
  console.log(`📊 题库题数: ${questions.length}`);

  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const q of questions) {
    try {
      // 检查是否已存在（避免重复导入）
      const existing = await (prisma as any).questions.findFirst({
        where: {
          skuCode_dayTag_seqNo: {
            skuCode: q.sku_code,
            dayTag: q.day_tag,
            seqNo: q.seq_no,
          },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await (prisma as any).questions.create({
        data: {
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
          status: q.status,
          stemHash: q.stem_hash,
        },
      });
      imported++;
    } catch (err: any) {
      failed++;
      console.error(`  ❌ 导入失败 [${q.sku_code} D${q.day_tag} Q${q.seq_no}]:`, err.message);
    }
  }

  console.log(`✅ [${skuLabel}] 导入完成: 新增${imported}, 跳过${skipped}, 失败${failed}`);
  return imported;
}

async function main() {
  console.log('========================================');
  console.log('📚 全量题库重新导入脚本');
  console.log('========================================');

  const dataDir = path.join(__dirname, 'data');
  
  const files = [
    { file: path.join(dataDir, 'questions_seed.json'), label: 'S1 (初一)' },
    { file: path.join(dataDir, 's3_seed.json'), label: 'S3 (初二)' },
    { file: path.join(dataDir, 's6_seed.json'), label: 'S6 (初三)' },
  ];

  let totalImported = 0;

  for (const { file, label } of files) {
    const count = await importSeedFile(file, label);
    totalImported += count;
  }

  // 验证数据
  console.log('\n📊 数据验证:');
  const skus = ['S1', 'S3-01', 'S6-01'];
  for (const sku of skus) {
    const count = await (prisma as any).questions.count({
      where: { skuCode: sku, status: 'active' },
    });
    console.log(`  ${sku}: ${count} 道题 (active状态)`);
  }

  const total = await (prisma as any).questions.count();
  console.log(`\n📈 数据库题库总计: ${total} 道题`);
  console.log(`\n🎉 导入完成! 共新增 ${totalImported} 道题`);
}

main().catch(console.error);
