#!/bin/bash
# ==========================================================
# setup_all_codespaces.sh - Codespaces 一键初始化脚本（最终版）
# 策略：用 pg 原生客户端执行 DDL（不依赖 Prisma 空schema验证）
# 步骤：env → (装依赖) → tsx run_ddl.ts → prisma pull+gen → 种子数据 → 访问码
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
cat > .env << 'ENVEOF'
DATABASE_URL="postgresql://postgres:Lyz654321%40c@db.qoagemxoijruustccapl.supabase.co:5432/postgres?connection_limit=1&pool_timeout=10"
DIRECT_URL="postgresql://postgres:Lyz654321%40c@db.qoagemxoijruustccapl.supabase.co:5432/postgres"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="change-me-in-production"
MAX_SESSIONS_PER_IP_PER_HOUR=10
ENVEOF
echo "  ✅ .env 已生成（真实 PROJECT_REF: qoagemxoijruustccapl）"
echo ""

# ---------- Step 2: 安装缺失依赖（如有） ----------
echo "[2/5] 📦  检查并安装运行依赖（pg/dotenv）..."
MISSING=""
node -e "require('pg')" 2>/dev/null || MISSING="$MISSING pg"
node -e "require('dotenv')" 2>/dev/null || MISSING="$MISSING dotenv"
if [ -n "$MISSING" ]; then
  echo "  ⚠️  缺失:$MISSING  正在安装..."
  npm install$MISSING @types/pg --save-dev --no-audit --no-fund --loglevel=error
  echo "  ✅ 安装完成"
else
  echo "  ✅ 依赖已就绪（pg/dotenv 均已安装）"
fi
echo ""

# ---------- Step 3: 执行 DDL ----------
echo "[3/5] 🗄️  执行 DDL 建表（13 张表）"
npx tsx scripts/run_ddl.ts
DDL_RC=$?
if [ $DDL_RC -ne 0 ]; then
  echo ""
  echo "❌ DDL 执行失败（退出码 $DDL_RC），请检查上方错误"
  exit 1
fi
echo ""

# ---------- Step 4: Prisma db pull + generate ----------
echo "[4/5] 🗂️  Prisma db pull + generate"
echo "  🔄 prisma db pull（从数据库结构生成 Prisma 模型）..."
npx prisma db pull
echo "  ✅ db pull 完成"
echo "  🔄 prisma generate（生成 Prisma Client）..."
npx prisma generate
echo "  ✅ generate 完成"
echo ""

# ---------- Step 5: 导入种子数据 + 访问码 ----------
echo "[5/5] 📥 导入种子数据 + 生成访问码"
echo ""
echo "  5.1 题库（49 题）..."
npm run seed
echo ""
echo "  5.2 蓝皮书..."
npx tsx scripts/seed_blueprints.ts
echo ""
echo "  5.3 知识点依赖..."
npx tsx scripts/seed_kp_dependencies.ts
echo ""
echo "  5.4 方法卡..."
npx tsx scripts/seed_method_cards.ts
echo ""
echo "  5.5 生成 5 个访问码"
echo "=============================================="
echo "🎟️  访问码列表（请保存好，后续测试必须用到）"
echo "=============================================="
npm run gen-codes -- --sku=S1_XIAOSHENGCHU_MATH --count=5
echo ""

echo ""
echo "=============================================="
echo "🎉 M1 里程碑全部完成！"
echo "=============================================="
echo ""
echo "下一步："
echo "  1. 将以上 5 个访问码复制保存"
echo "  2. 运行：npm run dev   # 启动开发服务器"
echo ""
