#!/bin/bash
# ==========================================================
# setup_all_codespaces.sh - Codespaces 一键初始化脚本（带兜底方案）
# 策略：
#   - 先尝试自动执行 DDL
#   - 如果网络/DDL执行失败，打印SQL让用户在Supabase网页手动执行
#   - 交互等待用户确认后，继续 Prisma pull → seed → 访问码
# ==========================================================
set -e

# ===== 强制所有 Node.js 进程 IPv4 优先 =====
export NODE_OPTIONS="--dns-result-order=ipv4first ${NODE_OPTIONS:-}"
export PRISMA_DNS_RESULT_ORDER="ipv4first"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

DDL_FILE="初始资料/codex诊断应用文档包/Codex_03_数据库DDL.sql"

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
  npm install$MISSING @types/pg --save-dev --no-audit --no-fund --loglevel=error 2>&1 | tail -5
  echo "  ✅ 安装完成"
else
  echo "  ✅ 依赖已就绪（pg/dotenv 均已安装）"
fi
echo ""

# ---------- Step 3: 执行 DDL（带兜底） ----------
echo "[3/5] 🗄️  执行 DDL 建表（13 张表）"
DDL_OK=0
if command -v npx >/dev/null 2>&1 && [ -f scripts/run_ddl.ts ]; then
  echo "  🔄 尝试自动执行 DDL..."
  if npx tsx scripts/run_ddl.ts; then
    DDL_OK=1
    echo "  ✅ DDL 自动执行成功！"
  else
    echo ""
    echo "  ⚠️  自动执行 DDL 失败（Codespaces 网络出口限制）"
  fi
fi

# 兜底：手动执行 DDL
if [ $DDL_OK -ne 1 ]; then
  echo ""
  echo "=============================================="
  echo "📌 请手动在 Supabase 网页执行 DDL（2 分钟搞定）"
  echo "=============================================="
  echo ""
  echo "  操作步骤："
  echo "  1️⃣  打开：https://supabase.com/dashboard/project/qoagemxoijruustccapl/sql/new"
  echo "      (如果跳转登录，先登录 Supabase)"
  echo ""
  echo "  2️⃣  在 Codespaces 终端执行以下命令，复制完整 SQL："
  echo ""
  echo "      cat \"$DDL_FILE\" | xclip -selection clipboard"
  echo "      或者： cat \"$DDL_FILE\"   # 手动选中复制"
  echo ""
  echo "  3️⃣  把 SQL 粘贴到 Supabase SQL Editor 大输入框"
  echo "  4️⃣  点击右下角 【Run】按钮执行"
  echo "  5️⃣  看到 【Success. No rows returned】就表示成功"
  echo ""
  echo "  💡 验证建表成功：在 Supabase SQL Editor 执行："
  echo "     SELECT count(*) FROM pg_tables WHERE schemaname='public';"
  echo "     期望结果 count >= 13"
  echo ""
  read -n 1 -s -p "  ✅ 在 Supabase 执行完 DDL 后，按任意键继续..."
  echo ""
  echo ""
  echo "  🎉 继续执行后续步骤（Prisma + 种子数据 + 访问码）..."
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
