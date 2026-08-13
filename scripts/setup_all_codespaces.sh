#!/bin/bash
# ==========================================================
# setup_all_codespaces.sh - Codespaces 一键初始化脚本（Supabase REST API 版）
# 
# 策略：使用 Supabase REST API (PostgREST) 通过 HTTPS 443 端口访问数据库
# 不再需要 Prisma 直连（5432端口），完全绕过 IPv6 网络限制
# 
# 前提：用户已在 Supabase 网页手动执行 DDL 建表（13 张表）
# ==========================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "=============================================="
echo "🎯 H5 学科诊断应用 - Codespaces 一键初始化"
echo "   （Supabase REST API 版 - HTTPS 443 端口）"
echo "=============================================="
echo ""

# ---------- Step 1: 生成 .env ----------
echo "[1/4] ⚙️  配置 .env (Supabase REST API)"

SKIP_ENV_WRITE=0

# 询问用户 Supabase 配置
if [ -f .env ] && grep -q "YOUR-PROJECT-REF" .env 2>/dev/null; then
  echo "  📋 检测到 .env 中有占位符，请输入 Supabase 项目信息："
  read -p "  PROJECT_REF (如 qoagemxoijruustccapl): " PROJECT_REF
  read -p "  SERVICE_ROLE_KEY: " SERVICE_ROLE_KEY
else
  # 如果 .env 已存在且已配置，询问是否覆盖
  if [ -f .env ]; then
    read -p "  .env 已存在，是否重新配置？(y/n): " RECONFIGURE
    if [ "$RECONFIGURE" != "y" ]; then
      echo "  ✅ 跳过 .env 配置"
      echo ""
      SKIP_ENV_WRITE=1
    fi
  fi
  
  if [ "$SKIP_ENV_WRITE" -eq 0 ]; then
    read -p "  PROJECT_REF (如 qoagemxoijruustccapl): " PROJECT_REF
    read -p "  SERVICE_ROLE_KEY: " SERVICE_ROLE_KEY
  fi
fi

if [ "$SKIP_ENV_WRITE" -eq 0 ]; then
  cat > .env << ENVEOF
NEXT_PUBLIC_SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="change-me-in-production"
MAX_SESSIONS_PER_IP_PER_HOUR=10
ENVEOF
echo "  ✅ .env 已生成"
echo "     SUPABASE_URL: https://${PROJECT_REF}.supabase.co"
echo "     API Key: ${SERVICE_ROLE_KEY:0:20}...（已隐藏）"
fi
echo ""

# ---------- Step 2: 安装/检查依赖 ----------
echo "[2/4] 📦  检查并安装依赖（dotenv）..."
MISSING=""
node -e "require('dotenv')" 2>/dev/null || MISSING="$MISSING dotenv"
if [ -n "$MISSING" ]; then
  echo "  ⚠️  缺失:$MISSING  正在安装..."
  npm install$MISSING --save-dev --no-audit --no-fund --loglevel=error 2>&1 | tail -5
  echo "  ✅ 安装完成"
else
  echo "  ✅ 依赖已就绪（dotenv 已安装）"
fi
echo ""

# ---------- Step 3: 验证 Supabase REST API 连接 ----------
echo "[3/4] 🔍  验证 Supabase REST API 连接..."
if node -e "
require('dotenv').config();
const url = process.env.SUPABASE_URL + '/rest/v1/questions?select=id&limit=1';
fetch(url, {
  headers: {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
  }
}).then(r => {
  if (r.ok) {
    console.log('  ✅ Supabase REST API 连接成功！');
    return r.json();
  } else {
    console.error('  ❌ 连接失败，状态码:', r.status);
    return r.text().then(t => { console.error('  错误详情:', t.slice(0, 300)); process.exit(1); });
  }
}).then(data => {
  const count = Array.isArray(data) ? data.length : 0;
  console.log('  📊 题库现有记录数:', count);
}).catch(e => {
  console.error('  ❌ 连接出错:', e.message);
  console.error('  💡 请检查：');
  console.error('     1. SUPABASE_URL 是否正确');
  console.error('     2. SUPABASE_SERVICE_ROLE_KEY 是否正确');
  console.error('     3. DDL 是否已在 Supabase 执行（questions 表是否存在）');
  process.exit(1);
});
"; then
  echo "  ✅ Supabase REST API 连接验证通过"
else
  echo "  ❌ 连接验证失败，请检查上方错误信息"
  exit 1
fi
echo ""

# ---------- Step 4: 导入种子数据 + 生成访问码 ----------
echo "[4/4] 📥 导入种子数据 + 生成访问码"
echo ""

echo "  4.1 题库（49 题）..."
npm run seed
echo "  ✅ 题库导入完成"
echo ""

echo "  4.2 蓝皮书..."
npx tsx scripts/seed_blueprints.ts
echo "  ✅ 蓝皮书导入完成"
echo ""

echo "  4.3 知识点依赖..."
npx tsx scripts/seed_kp_dependencies.ts
echo "  ✅ 知识点依赖导入完成"
echo ""

echo "  4.4 方法卡..."
npx tsx scripts/seed_method_cards.ts
echo "  ✅ 方法卡导入完成"
echo ""

echo "  4.5 生成 5 个访问码"
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
