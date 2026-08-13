/**
 * seed_kp_dependencies.ts
 * 知识点依赖表导入脚本
 *
 * 从 questions_seed.json 中提取所有 kp_code，并根据数学知识体系创建依赖关系。
 * 知识点编码规范：
 *   - KP-XX.Y  初中知识点（章.节）
 *   - KP-P.X   小学前置知识点（下探层）
 *
 * DDL中kp_dependencies表结构：
 *   kp_code         VARCHAR(32) NOT NULL UNIQUE
 *   kp_name         VARCHAR(128) NOT NULL
 *   module          VARCHAR(32) NOT NULL  -- 数与代数/图形与几何/统计与概率
 *   prerequisite_ids VARCHAR(32)[] NOT NULL DEFAULT '{}'  -- 直接前置考点
 *
 * 运行前必须先执行 prisma db pull && prisma generate 生成 Prisma Client。
 * 用法：npx tsx scripts/seed_kp_dependencies.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------- 类型定义 ----------

interface KpDependency {
  kp_code: string;
  kp_name: string;
  module: string;
  prerequisite_ids: string[];
}

// ---------- 知识点依赖种子数据 ----------
// 数据来源：questions_seed.json 中的 kp_code + kp_related 字段，
// 结合数学知识体系（人教版七年级上册）补充完整的依赖关系。
// 小学前置知识点以 KP-P. 前缀编码。

const kpDependencies: KpDependency[] = [
  // ========== 数与代数 ==========
  // ---- 第一章：有理数 ----
  {
    kp_code: 'KP-01.1',
    kp_name: '正负数的意义',
    module: '数与代数',
    prerequisite_ids: [],
  },
  {
    kp_code: 'KP-01.2',
    kp_name: '数轴与有理数的表示',
    module: '数与代数',
    prerequisite_ids: ['KP-01.1'],
  },
  {
    kp_code: 'KP-01.3',
    kp_name: '绝对值与相反数',
    module: '数与代数',
    prerequisite_ids: ['KP-01.1', 'KP-01.2'],
  },
  {
    kp_code: 'KP-01.4',
    kp_name: '有理数比较大小',
    module: '数与代数',
    prerequisite_ids: ['KP-01.2', 'KP-01.3'],
  },
  {
    kp_code: 'KP-01.5',
    kp_name: '有理数的加法',
    module: '数与代数',
    prerequisite_ids: ['KP-01.1', 'KP-01.3'],
  },
  {
    kp_code: 'KP-01.6',
    kp_name: '有理数的减法',
    module: '数与代数',
    prerequisite_ids: ['KP-01.5'],
  },
  {
    kp_code: 'KP-01.7',
    kp_name: '有理数的加减混合运算',
    module: '数与代数',
    prerequisite_ids: ['KP-01.5', 'KP-01.6', 'KP-P.1'],
  },
  {
    kp_code: 'KP-01.8',
    kp_name: '有理数的乘法',
    module: '数与代数',
    prerequisite_ids: ['KP-01.1', 'KP-01.3'],
  },
  {
    kp_code: 'KP-01.9',
    kp_name: '有理数的除法',
    module: '数与代数',
    prerequisite_ids: ['KP-01.8'],
  },
  {
    kp_code: 'KP-01.10',
    kp_name: '有理数的乘方',
    module: '数与代数',
    prerequisite_ids: ['KP-01.8'],
  },
  {
    kp_code: 'KP-01.11',
    kp_name: '有理数的混合运算',
    module: '数与代数',
    prerequisite_ids: ['KP-01.7', 'KP-01.8', 'KP-01.9', 'KP-01.10'],
  },

  // ---- 第三章：整式的加减 ----
  {
    kp_code: 'KP-03.1',
    kp_name: '用字母表示数',
    module: '数与代数',
    prerequisite_ids: ['KP-P.5'],
  },
  {
    kp_code: 'KP-03.2',
    kp_name: '列代数式',
    module: '数与代数',
    prerequisite_ids: ['KP-03.1'],
  },
  {
    kp_code: 'KP-03.3',
    kp_name: '代数式与规律探索',
    module: '数与代数',
    prerequisite_ids: ['KP-03.2'],
  },
  {
    kp_code: 'KP-03.4',
    kp_name: '代数式求值',
    module: '数与代数',
    prerequisite_ids: ['KP-03.2'],
  },

  // ---- 第四章：整式的加减 ----
  {
    kp_code: 'KP-04.1',
    kp_name: '单项式',
    module: '数与代数',
    prerequisite_ids: ['KP-03.1'],
  },
  {
    kp_code: 'KP-04.2',
    kp_name: '同类项与合并同类项',
    module: '数与代数',
    prerequisite_ids: ['KP-04.1'],
  },
  {
    kp_code: 'KP-04.3',
    kp_name: '去括号',
    module: '数与代数',
    prerequisite_ids: ['KP-04.2'],
  },
  {
    kp_code: 'KP-04.4',
    kp_name: '整式的加减',
    module: '数与代数',
    prerequisite_ids: ['KP-04.3'],
  },

  // ---- 第五章：一元一次方程 ----
  {
    kp_code: 'KP-05.1',
    kp_name: '等式的性质',
    module: '数与代数',
    prerequisite_ids: [],
  },
  {
    kp_code: 'KP-05.2',
    kp_name: '一元一次方程的概念',
    module: '数与代数',
    prerequisite_ids: ['KP-05.1'],
  },
  {
    kp_code: 'KP-05.3',
    kp_name: '解一元一次方程',
    module: '数与代数',
    prerequisite_ids: ['KP-05.2', 'KP-04.4', 'KP-P.2'],
  },
  {
    kp_code: 'KP-05.4',
    kp_name: '一元一次方程的应用',
    module: '数与代数',
    prerequisite_ids: ['KP-05.3'],
  },

  // ---- 小学前置知识点（KP-P. 前缀） ----
  {
    kp_code: 'KP-P.1',
    kp_name: '分数四则混合运算（小学前置）',
    module: '数与代数',
    prerequisite_ids: [],
  },
  {
    kp_code: 'KP-P.2',
    kp_name: '简易方程（小学前置）',
    module: '数与代数',
    prerequisite_ids: [],
  },
  {
    kp_code: 'KP-P.4',
    kp_name: '口算两步混合运算（小学前置）',
    module: '数与代数',
    prerequisite_ids: [],
  },
  {
    kp_code: 'KP-P.5',
    kp_name: '用字母表示数（小学前置）',
    module: '数与代数',
    prerequisite_ids: [],
  },

  // ========== 图形与几何 ==========
  // ---- 第二章：几何图形初步 ----
  {
    kp_code: 'KP-02.2',
    kp_name: '线段',
    module: '图形与几何',
    prerequisite_ids: [],
  },
  {
    kp_code: 'KP-02.4',
    kp_name: '线段的中点',
    module: '图形与几何',
    prerequisite_ids: ['KP-02.2'],
  },
  {
    kp_code: 'KP-02.7',
    kp_name: '角及其运算',
    module: '图形与几何',
    prerequisite_ids: ['KP-P.3'],
  },

  // ---- 小学前置知识点 ----
  {
    kp_code: 'KP-P.3',
    kp_name: '角与度分秒（小学前置）',
    module: '图形与几何',
    prerequisite_ids: [],
  },
];

// ---------- 主逻辑 ----------

async function main() {
  console.log('📖 开始导入知识点依赖表...\n');
  console.log(`  共 ${kpDependencies.length} 个知识点\n`);

  // 按模块统计
  const moduleCount: Record<string, number> = {};
  for (const kp of kpDependencies) {
    moduleCount[kp.module] = (moduleCount[kp.module] || 0) + 1;
  }
  for (const [mod, cnt] of Object.entries(moduleCount)) {
    console.log(`  ${mod}: ${cnt} 个`);
  }
  console.log('');

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const kp of kpDependencies) {
    try {
      // upsert：以 kp_code 为唯一键
      await prisma.kpDependencies.upsert({
        where: { kpCode: kp.kp_code },
        update: {
          kpName: kp.kp_name,
          module: kp.module,
          prerequisiteIds: kp.prerequisite_ids,
        },
        create: {
          kpCode: kp.kp_code,
          kpName: kp.kp_name,
          module: kp.module,
          prerequisiteIds: kp.prerequisite_ids,
        },
      });

      success++;
      const prereq = kp.prerequisite_ids.length > 0
        ? kp.prerequisite_ids.join(', ')
        : '无';
      console.log(`  ✅ ${kp.kp_code} ${kp.kp_name} [前置: ${prereq}]`);
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${kp.kp_code}: ${errMsg}`);
      console.error(`  ❌ ${kp.kp_code} 导入失败: ${errMsg}`);
    }
  }

  // 输出统计
  console.log('\n' + '='.repeat(60));
  console.log('📋 导入统计');
  console.log('='.repeat(60));
  console.log(`  总数: ${kpDependencies.length}`);
  console.log(`  成功: ${success}`);
  console.log(`  失败: ${failed}`);

  if (errors.length > 0) {
    console.log('\n⚠️ 失败详情:');
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
  }

  console.log('\n' + (failed === 0 ? '🎉 知识点依赖表导入完成！' : `⚠️ 有 ${failed} 个知识点导入失败。`));
}

main()
  .catch((err) => {
    console.error('💥 脚本执行出错:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
