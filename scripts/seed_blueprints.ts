/**
 * seed_blueprints.ts
 * 蓝皮书数据导入脚本
 *
 * 导入SKU定位卡（positioning 10字段）和三天模块结构（day_modules）。
 * 数据来源：初始资料/codex诊断应用文档包/Codex_05_题库与内容数据格式.md
 *
 * 运行前必须先执行 prisma db pull && prisma generate 生成 Prisma Client。
 * 用法：npx tsx scripts/seed_blueprints.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------- 蓝皮书类型定义 ----------

interface ModuleWeight {
  module: string;
  weight: number;
}

interface Positioning {
  name: string;
  target_audience: string;
  diag_goals: number[];
  difficulty_baseline: number[];
  module_weights: ModuleWeight[];
  report_focus: string[];
  升学关联度: string;
  prerequisite_scope: string[];
  reference_type: string;
  retest_sku: string;
}

interface DayModule {
  day: number;
  title: string;
  time_limit_min: number;
  cognitive_range: string[];
  warmup_question_ids: number[];
  question_ids: number[];
}

interface Blueprint {
  sku_code: string;
  subject: string;
  positioning: Positioning;
  day_modules: DayModule[];
}

// ---------- 种子数据 ----------
// 来源：Codex_05 第3章 蓝皮书对象 + 产品总规范

const blueprints: Blueprint[] = [
  {
    sku_code: 'S1_XIAOSHENGCHU_MATH',
    subject: 'math',
    positioning: {
      name: '小升初衔接适应期诊断',
      target_audience: '七年级新生/开学4-8周',
      diag_goals: [1, 4], // ①知识摸底 + ④升学衔接
      difficulty_baseline: [70, 78],
      module_weights: [
        { module: '有理数运算', weight: 0.30 },
        { module: '整式加减', weight: 0.25 },
        { module: '一元一次方程应用', weight: 0.25 },
        { module: '小学前置', weight: 0.20 },
      ],
      report_focus: [
        '能否适应初中节奏',
        '计算习惯是否过关',
        '应用题理解能力',
      ],
      升学关联度: '中',
      prerequisite_scope: [
        'KP-P.1',
        'KP-P.2',
        'KP-P.3',
        'KP-P.4',
        'KP-P.5',
      ],
      reference_type: 'criterion',
      retest_sku: 'S2_QISHANG_MIDTERM_MATH',
    },
    day_modules: [
      {
        day: 1,
        title: '基础能力扫描',
        time_limit_min: 30,
        cognitive_range: ['L1', 'L2'],
        warmup_question_ids: [],
        question_ids: [],
      },
      {
        day: 2,
        title: '应用能力诊断',
        time_limit_min: 35,
        cognitive_range: ['L2', 'L3'],
        warmup_question_ids: [],
        question_ids: [],
      },
      {
        day: 3,
        title: '综合与思维诊断',
        time_limit_min: 40,
        cognitive_range: ['L3', 'L4'],
        warmup_question_ids: [],
        question_ids: [],
      },
    ],
  },
];

// ---------- 主逻辑 ----------

async function main() {
  console.log('📖 开始导入蓝皮书数据...\n');
  console.log(`  共 ${blueprints.length} 个SKU\n`);

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const bp of blueprints) {
    const label = `[${bp.sku_code}]`;

    try {
      // upsert：以 sku_code 为唯一键
      await prisma.blueprints.upsert({
        where: { skuCode: bp.sku_code },
        update: {
          subject: bp.subject,
          positioning: bp.positioning as any,
          dayModules: bp.day_modules as any,
          updatedAt: new Date(),
        },
        create: {
          skuCode: bp.sku_code,
          subject: bp.subject,
          positioning: bp.positioning as any,
          dayModules: bp.day_modules as any,
        },
      });

      success++;
      console.log(`  ✅ ${label} 导入成功`);
      console.log(`     定位卡: ${bp.positioning.name}`);
      console.log(`     目标受众: ${bp.positioning.target_audience}`);
      console.log(`     模块权重: ${bp.positioning.module_weights.map((m) => `${m.module}(${m.weight})`).join(', ')}`);
      console.log(`     三天结构: ${bp.day_modules.map((d) => `D${d.day}-${d.title}`).join(', ')}`);
      console.log('');
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${errMsg}`);
      console.error(`  ❌ ${label} 导入失败: ${errMsg}\n`);
    }
  }

  // 输出统计
  console.log('='.repeat(60));
  console.log('📋 导入统计');
  console.log('='.repeat(60));
  console.log(`  成功: ${success}`);
  console.log(`  失败: ${failed}`);

  if (errors.length > 0) {
    console.log('\n⚠️ 失败详情:');
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
  }

  console.log('\n' + (failed === 0 ? '🎉 蓝皮书导入完成！' : `⚠️ 有 ${failed} 个SKU导入失败。`));
}

main()
  .catch((err) => {
    console.error('💥 脚本执行出错:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
