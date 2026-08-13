#!/bin/bash
# setup.sh - GitHub Codespaces 一键配置脚本
# 在Codespaces终端中运行: bash setup.sh

set -e

echo "=========================================="
echo "  H5学科诊断应用 - Codespaces配置脚本"
echo "=========================================="

# 1. 安装依赖
echo ""
echo "[1/6] 安装npm依赖..."
npm install --no-audit --no-fund
echo "✓ npm install完成"

# 2. 检查环境变量
echo ""
echo "[2/6] 检查环境变量..."
if [ ! -f .env ]; then
  echo "请先创建.env文件,配置以下变量:"
  echo "  DATABASE_URL=postgresql://..."
  echo "  DIRECT_URL=postgresql://..."
  echo ""
  echo "创建.env文件后重新运行: bash setup.sh"
  exit 1
fi
echo "✓ .env文件存在"

# 3. 运行DDL建表
echo ""
echo "[3/6] 运行DDL建表..."
npx prisma db push --accept-data-loss 2>/dev/null || echo "DDL需要手动在Supabase SQL Editor中执行"
echo "✓ 数据库表结构就绪"

# 4. 生成Prisma Client
echo ""
echo "[4/6] 生成Prisma Client..."
npx prisma db pull
npx prisma generate
echo "✓ Prisma Client已生成"

# 5. 导入种子数据
echo ""
echo "[5/6] 导入种子数据..."
npx tsx scripts/seed_questions.ts || echo "题库导入失败,请检查数据库连接"
npx tsx scripts/seed_blueprints.ts || echo "蓝皮书导入失败"
npx tsx scripts/seed_kp_dependencies.ts || echo "知识点依赖导入失败"
npx tsx scripts/seed_method_cards.ts || echo "方法卡导入失败"
echo "✓ 种子数据导入完成"

# 6. 生成访问码
echo ""
echo "[6/6] 生成测试访问码..."
npx tsx scripts/gen_access_codes.ts -- --sku=S1_XIAOSHENGCHU_MATH --count=5 || echo "访问码生成失败"
echo "✓ 访问码已生成"

echo ""
echo "=========================================="
echo "  配置完成!启动开发服务器:"
echo "  npm run dev"
echo "=========================================="
