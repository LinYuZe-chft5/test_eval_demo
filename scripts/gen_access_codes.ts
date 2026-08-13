/**
 * gen_access_codes.ts
 * 访问码生成脚本
 *
 * 使用 nanoid 生成8位随机访问码（大写字母+数字，排除易混淆字符 0/O, 1/I/L）。
 * 批量写入 access_codes 表，默认30天有效期。
 *
 * 运行前必须先执行 prisma db pull && prisma generate 生成 Prisma Client。
 * 用法：npm run gen-codes -- --sku=S1_XIAOSHENGCHU_MATH --count=10
 */
import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

const prisma = new PrismaClient();

// 排除易混淆字符: 0/O, 1/I/L
const generateCode = customAlphabet('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 8);

interface GenOptions {
  sku: string;
  count: number;
}

/**
 * 解析命令行参数
 * 支持 --sku=XXX 和 --count=N 两种格式
 */
function parseArgs(): GenOptions {
  const args = process.argv.slice(2);
  let sku = '';
  let count = 10;

  for (const arg of args) {
    if (arg.startsWith('--sku=')) {
      sku = arg.slice(6);
    } else if (arg.startsWith('--count=')) {
      const parsed = parseInt(arg.slice(8), 10);
      if (!isNaN(parsed) && parsed > 0) {
        count = parsed;
      }
    }
  }

  if (!sku) {
    console.error('错误: 必须指定 --sku 参数');
    console.error('用法: npm run gen-codes -- --sku=S1_XIAOSHENGCHU_MATH --count=10');
    process.exit(1);
  }

  return { sku, count };
}

async function main() {
  const { sku, count } = parseArgs();
  console.log('开始生成访问码...');
  console.log('  SKU: ' + sku);
  console.log('  数量: ' + count);

  // 计算过期时间（30天后）
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  // 生成访问码（确保唯一性）
  const codes: string[] = [];
  const seen = new Set<string>();

  while (codes.length < count) {
    const code = generateCode();
    if (!seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }

  // 批量写入数据库
  try {
    const result = await prisma.accessCodes.createMany({
      data: codes.map((code) => ({
        code,
        skuCode: sku,
        status: 'active',
        expiresAt,
      })),
    });

    console.log('\n成功写入 ' + result.count + ' 条记录');
  } catch (err) {
    console.error('写入数据库失败:', err);
    throw err;
  }

  // 输出生成的访问码列表
  console.log('\n生成的访问码列表:');
  console.log('----------------------------------------');
  for (let i = 0; i < codes.length; i++) {
    console.log('  ' + (i + 1) + '. ' + codes[i]);
  }
  console.log('----------------------------------------');
  console.log('有效期至: ' + expiresAt.toISOString().split('T')[0]);
}

main()
  .catch((err) => {
    console.error('执行出错:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
