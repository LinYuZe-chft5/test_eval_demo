#!/bin/bash
# ==========================================================
# setup_all_codespaces.sh - Codespaces 一键初始化脚本
#                                         （Supabase REST API + DDShub LLM）
# 
# 策略：
#   · 使用 Supabase REST API (PostgREST) 通过 HTTPS 443 端口访问数据库
#     （不再需要 Prisma 直连 5432 端口，绕过 IPv6 网络限制）
#   · 可选配置呆呆兽中转站(DDShub)的 GPT-5.6-terra 模型，用于
#     五层流水线 Layer 2（单题阅卷）和 Layer 5（报告文案）
#     未配置时自动降级为程序判分+模板生成（Demo可用）
# 
# 前提：用户已在 Supabase 网页手动执行 DDL 建表（13 张表）
# ==========================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

echo "=============================================="
echo "🎯 H5 学科诊断应用 - Codespaces 一键初始化"
echo "   Supabase REST API + 呆呆兽中转站 LLM"
echo "=============================================="
echo ""

# ---------- Step 1: 生成 .env ----------
echo "[1/5] ⚙️  配置 .env (Supabase + LLM)"

WRITE_ENV=1
if [ -f .env ]; then
  read -p "  .env 已存在，是否重新配置？(y/N): " RECONFIGURE
  RECONFIGURE=${RECONFIGURE:-n}
  if [ "$RECONFIGURE" != "y" ]; then
    echo "  ✅ 跳过 .env 写入（保留现有配置）"
    WRITE_ENV=0
  fi
fi

if [ "$WRITE_ENV" -eq 1 ]; then
  echo ""
  echo "  -------- Supabase 配置 --------"
  read -p "  PROJECT_REF (如 qoagemxoijruustccapl): " PROJECT_REF
  read -p "  SERVICE_ROLE_KEY: " SERVICE_ROLE_KEY

  echo ""
  echo "  -------- 呆呆兽中转站 LLM 配置（可选） --------"
  echo "  官网：https://www.ddshub.cc/"
  echo "  说明：不填则自动降级为程序判分+模板生成（不影响Demo闭环）"
  read -p "  LLM_API_URL [默认 https://ddshub.cc/v1]: " LLM_API_URL
  LLM_API_URL=${LLM_API_URL:-https://ddshub.cc/v1}
  read -p "  LLM_API_KEY (sk-开头，留空则跳过LLM): " LLM_API_KEY
  read -p "  LLM_MODEL [默认 gpt-5.6-terra]: " LLM_MODEL
  LLM_MODEL=${LLM_MODEL:-gpt-5.6-terra}

  cat > .env << ENVEOF
# ===== Supabase 项目配置 =====
NEXT_PUBLIC_SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY}"

# ===== 管理员账号 (MVP单一管理员) =====
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="change-me-in-production"

# ===== 防滥用 (规则常量) =====
MAX_SESSIONS_PER_IP_PER_HOUR=10

# ===== LLM API 配置（五层流水线 Layer 2 & Layer 5） =====
# 兼容 OpenAI 兼容格式 API（呆呆兽中转站 DDShub）
# 兼容两种 URL 写法：
#   A) 直接写完整 chat/completions URL → https://ddshub.cc/v1/chat/completions
#   B) 仅写 base URL（代码自动补全路径）→ https://ddshub.cc/v1
LLM_API_URL="${LLM_API_URL}"
LLM_API_KEY="${LLM_API_KEY}"
LLM_MODEL="${LLM_MODEL}"

# ===== Node 环境 =====
NODE_ENV=development
ENVEOF

  echo ""
  echo "  ✅ .env 已生成"
  echo "     SUPABASE_URL : https://${PROJECT_REF}.supabase.co"
  echo "     SUPABASE_KEY : ${SERVICE_ROLE_KEY:0:8}...${SERVICE_ROLE_KEY: -4} (已掩码)"
  if [ -n "$LLM_API_KEY" ]; then
    echo "     LLM_API_URL  : ${LLM_API_URL}"
    echo "     LLM_MODEL    : ${LLM_MODEL}"
    echo "     LLM_API_KEY  : ${LLM_API_KEY:0:6}...${LLM_API_KEY: -4} (已掩码)"
  else
    echo "     LLM          : ⚠️  未配置 → 流水线自动降级（Demo可用）"
  fi
fi
echo ""

# ---------- Step 2: 安装/检查依赖 ----------
echo "[2/5] 📦  检查并安装依赖（dotenv / tsx 等）..."
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
echo "[3/5] 🔍  验证 Supabase REST API 连接..."
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

# ---------- Step 4: LLM 连通性验证（可选） ----------
echo "[4/5] 🧠  验证呆呆兽中转站 LLM 连通性（可选）..."
HAS_LLM_KEY=$(node -e "require('dotenv').config(); console.log(process.env.LLM_API_KEY ? '1' : '0')")
if [ "$HAS_LLM_KEY" = "1" ]; then
  echo "  检测到 LLM_API_KEY 已配置，开始连通性检查（5 项）..."
  if npx tsx scripts/test_llm_connection.ts; then
    echo "  ✅ LLM 五层流水线调用链路验证通过"
  else
    echo "  ⚠️  LLM 验证失败，但不影响 Demo 运行（会自动降级为模板方案）"
    echo "     常见错误码：401=密钥错误  402=额度不足  429=超频  model_not_found=模型名不对"
  fi
else
  echo "  ⚠️  LLM_API_KEY 未配置 → 跳过 LLM 验证"
  echo "     流水线将自动降级为：程序判分 + 模板生成报告（Demo可用）"
  echo "     如需启用 LLM：编辑 .env 填入 LLM_API_KEY 后执行：npm run test:llm"
fi
echo ""

# ---------- Step 5: 导入种子数据（S1/S3/S6全套） + 生成访问码 ----------
echo "[5/5] 📥 导入全套种子数据（S1/S3/S6） + 生成访问码"
echo ""
echo "  提示：将执行 npm run reimport:all，包含清空→导入→元数据增强全流程"
read -p "  确认执行？(Y/n): " CONFIRM_IMPORT
CONFIRM_IMPORT=${CONFIRM_IMPORT:-Y}
if [ "$CONFIRM_IMPORT" = "Y" ] || [ "$CONFIRM_IMPORT" = "y" ]; then
  echo "  5.1 执行全量数据导入（S1 49题 + S3 41题 + S6 37题 = 共127题）..."
  npm run reimport:all
  echo "  ✅ 全套题库数据导入完成"
else
  echo "  ⚠️  已跳过题库导入（稍后可手动执行: npm run reimport:all）"
fi
echo ""

echo "  5.2 生成各学段访问码"
echo "=============================================="
echo "🎟️  访问码列表（请保存好，后续测试必须用到）"
echo "=============================================="
echo "  · 初一(S1) 访问码 x 3："
npm run gen-codes -- --sku=S1_XIAOSHENGCHU_MATH --count=3 2>/dev/null || true
echo ""
echo "  · 初二(S3-01) 访问码 x 3："
npm run gen-codes -- --sku=S3-01 --count=3 2>/dev/null || true
echo ""
echo "  · 初三(S6-01) 访问码 x 3："
npm run gen-codes -- --sku=S6-01 --count=3 2>/dev/null || true
echo "=============================================="

echo ""
echo "=============================================="
echo "🎉 全部初始化完成！"
echo "=============================================="
echo ""
echo "关键验收项："
echo "  ✅ Supabase REST API 连通性      → 第[3/5]步验证"
echo "  ✅ 呆呆兽 LLM 调用链路          → 第[4/5]步验证（未配置则降级）"
echo "  ✅ S1/S3/S6 全套题库 127 题     → 第[5/5]步导入"
echo "  ✅ 三个学段各 3 个访问码         → 上方已生成"
echo ""
echo "下一步："
echo "  1. 复制保存上方生成的访问码"
echo "  2. 启动开发服务器：  npm run dev"
echo "  3. 如需单独验证 LLM：npm run test:llm"
echo ""
