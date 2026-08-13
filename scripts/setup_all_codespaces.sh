#!/bin/bash
# ==========================================================
# setup_all_codespaces.sh - Codespaces 一键初始化脚本
# 功能：自动安装缺失依赖 → .env配置 → DDL建表 → Prisma → 种子数据 → 访问码
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

# ---------- Step 0: 自动安装缺失依赖 ----------
echo "[0/6] 📦  检查并安装缺失依赖 (pg, dotenv)..."
if node -e "require('pg'); require('dotenv')" 2>/dev/null; then
  echo "  ✅ 依赖已就绪"
else
  echo "  ⚠️  检测到缺失依赖，正在安装 pg 和 dotenv..."
  npm install pg dotenv @types/pg --save-dev --no-audit --no-fund --prefer-offline 2>/dev/null || \
  npm install pg dotenv @types/pg --save-dev --no-audit --no-fund
  echo "  ✅ 依赖安装完成"
fi
echo ""

# ---------- Step 3: 生成 .env ----------
echo "[3/6] ⚙️  配置 .env (Supabase 连接)"
if [ ! -f .env ]; then
  cat > .env << 'ENVEOF'
DATABASE_URL="postgresql://postgres:Lyz654321%40c@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?connection_limit=1&pool_timeout=10"
DIRECT_URL="postgresql://postgres:Lyz654321%40c@db.abcdefghijklmnopqrst.supabase.co:5432/postgres"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="change-me-in-production"
MAX_SESSIONS_PER_IP_PER_HOUR=10
ENVEOF
  echo "  ✅ .env 已生成"
else
  echo "  ⚠️  .env 已存在，跳过生成（如需重置请先 rm .env）"
fi
echo ""

# ---------- Step 4: 执行 DDL 建表 ----------
echo "[4/6] 🗄️  在 Supabase 执行 DDL 建表（13 张表）"
DDL_FILE="初始资料/codex诊断应用文档包/Codex_03_数据库DDL.sql"

# 使用 node + pg 执行 DDL（更可靠）
node -e "
const { Client } = require('pg');
const fs = require('fs');
require('dotenv').config();

const conn = process.env.DIRECT_URL;
if (!conn) { console.error('❌ DIRECT_URL 未加载，请检查 .env'); process.exit(1); }

console.log('  🔌 连接数据库...');
const ddl = fs.readFileSync('$DDL_FILE','utf8');

// 分割语句：去除注释、按分号分割
const stmts = ddl
  .replace(/\/\*[\s\S]*?\*\//g, '')   // 去除块注释
  .replace(/--.*?\n/g, '')             // 去除行注释
  .replace(/\/\/.*?\n/g, '')           // 去除 // 注释
  .split(';')
  .map(s => s.trim())
  .filter(Boolean);

(async() => {
  const c = new Client({ connectionString: conn });
  try {
    await c.connect();
    console.log('  ✅ 已连接 Supabase');
    console.log('  📋 共解析出 ' + stmts.length + ' 条语句\n');

    let ok = 0, skip = 0, fail = 0;
    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      try {
        await c.query(s);
        ok++;
        process.stdout.write('\r  ⏳  执行中... 成功=' + ok + ' 跳过=' + skip + ' 失败=' + fail);
      } catch(e) {
        const m = e.message || '';
        // 已存在类错误 -> 跳过
        if (m.includes('already exists') || m.includes('42P07') || m.includes('duplicate key') || m.includes('relation')) {
          skip++;
          process.stdout.write('\r  ⏳  执行中... 成功=' + ok + ' 跳过=' + skip + ' 失败=' + fail);
        } else {
          fail++;
          console.log('');
          console.log('  ❌ [' + (i+1) + '/' + stmts.length + '] 失败: ' + m.split('\n')[0]);
          console.log('     SQL: ' + s.slice(0, 120) + (s.length > 120 ? '...' : ''));
        }
      }
    }
    console.log('');
    console.log('');
    console.log('  📊 DDL 执行结果:');
    console.log('     ✅ 成功: ' + ok);
    console.log('     ⚠️  跳过(已存在): ' + skip);
    console.log('     ❌ 失败: ' + fail);

    if (fail > 0) {
      console.log('\n  💡 如有失败语句，请手动在 Supabase SQL Editor 执行');
      process.exit(1);
    }
    console.log('\n  🎉 DDL 建表完成！\n');
  } finally {
    await c.end();
  }
})().catch(e => {
  console.error('❌ DDL 执行出错:', e.message || e);
  process.exit(1);
});
"
DDL_EXIT=$?

if [ $DDL_EXIT -ne 0 ]; then
  echo "❌ DDL 执行失败，请检查上方错误信息"
  echo "💡 备选方案：手动在 Supabase SQL Editor 执行 DDL 文件"
  exit 1
fi
echo ""

# ---------- Step 5: Prisma db pull + generate ----------
echo "[5/6] 🗂️  Prisma db pull + generate"
echo "  🔄 prisma db pull..."
npx prisma db pull
echo "  ✅ db pull 完成"
echo "  🔄 prisma generate..."
npx prisma generate
echo "  ✅ generate 完成"
echo ""

# ---------- Step 6: 种子数据 + 访问码 ----------
echo "[6/6] 📥 导入种子数据（题库/蓝皮书/知识点/方法卡）"
echo ""

echo "  6.1 题库（49 题）..."
npm run seed
echo ""

echo "  6.2 蓝皮书..."
npx tsx scripts/seed_blueprints.ts
echo ""

echo "  6.3 知识点依赖..."
npx tsx scripts/seed_kp_dependencies.ts
echo ""

echo "  6.4 方法卡..."
npx tsx scripts/seed_method_cards.ts
echo ""

echo "  6.5 生成 5 个访问码..."
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
echo "  1. 将上面的 5 个访问码保存好"
echo "  2. 运行：npm run dev   # 启动开发服务器"
echo ""
