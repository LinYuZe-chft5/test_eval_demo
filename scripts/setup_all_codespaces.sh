#!/bin/bash
# ==========================================================
# setup_all_codespaces.sh - Codespaces 一键初始化脚本（简化版）
# 功能：.env配置 → Prisma db execute DDL → Prisma pull+generate → 种子数据 → 访问码
# 用法：在 Codespaces 终端执行：bash scripts/setup_all_codespaces.sh
# ==========================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "=============================================="
echo "🎯 H5 学科诊断应用 - Codespaces 一键初始化"
echo "=============================================="
echo ""

# ---------- Step 1: 生成 .env ----------
echo "[1/5] ⚙️  配置 .env (Supabase 连接)"
if [ ! -f .env ]; then
  cat > .env << 'ENVEOF'
DATABASE_URL="postgresql://postgres:Lyz654321%40c@db.qoagemxoijruustccapl.supabase.co:5432/postgres?connection_limit=1&pool_timeout=10"
DIRECT_URL="postgresql://postgres:Lyz654321%40c@db.qoagemxoijruustccapl.supabase.co:5432/postgres"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="change-me-in-production"
MAX_SESSIONS_PER_IP_PER_HOUR=10
ENVEOF
  echo "  ✅ .env 已生成"
else
  echo "  ⚠️  .env 已存在，跳过（如需重置请先执行：rm .env）"
fi
echo ""

# ---------- Step 2: Prisma db execute 执行 DDL ----------
echo "[2/5] 🗄️  执行 DDL 建表（使用 Prisma db execute）"
DDL_FILE="初始资料/codex诊断应用文档包/Codex_03_数据库DDL.sql"

if [ ! -f "$DDL_FILE" ]; then
  echo "  ❌ DDL 文件不存在: $DDL_FILE"
  exit 1
fi

echo "  🔄 正在执行 DDL（首次可能需要几秒连接 Supabase）..."
# Prisma db execute 可以直接执行原始 SQL 文件，不需要额外的 pg 客户端
npx prisma db execute --file "$DDL_FILE" --schema prisma/schema.prisma 2>&1
echo "  ✅ DDL 执行完成"
echo ""

# ---------- Step 3: Prisma db pull + generate ----------
echo "[3/5] 🗂️  Prisma db pull + generate"
echo "  🔄 prisma db pull..."
npx prisma db pull 2>&1
echo "  ✅ db pull 完成"
echo "  🔄 prisma generate..."
npx prisma generate 2>&1
echo "  ✅ generate 完成"
echo ""

# ---------- Step 4: 导入种子数据 ----------
echo "[4/5] 📥 导入种子数据"
echo ""

echo "  4.1 题库（49 题）..."
npm run seed 2>&1
echo ""

echo "  4.2 蓝皮书..."
npx tsx scripts/seed_blueprints.ts 2>&1
echo ""

echo "  4.3 知识点依赖..."
npx tsx scripts/seed_kp_dependencies.ts 2>&1
echo ""

echo "  4.4 方法卡..."
npx tsx scripts/seed_method_cards.ts 2>&1
echo ""

# ---------- Step 5: 生成访问码 ----------
echo "[5/5] 🎟️  生成 5 个访问码"
echo "=============================================="
echo "访问码列表（请保存好，后续测试必须用到）"
echo "=============================================="
npm run gen-codes -- --sku=S1_XIAOSHENGCHU_MATH --count=5 2>&1
echo ""

echo ""
echo "=============================================="
echo "🎉 M1 里程碑全部完成！"
echo "=============================================="
echo ""
echo "下一步："
echo "  1. 将上面的 5 个访问码保存好"
echo "  2. 运行：npm run dev   # 启动开发服务器"
echo ""
