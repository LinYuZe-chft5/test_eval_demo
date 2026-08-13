#!/bin/bash
# ==========================================================
# setup_all_codespaces.sh - Codespaces 一键初始化脚本
# 功能：第3步.env配置 → 第4步DDL建表 → 第5步Prisma → 第6步种子数据+访问码
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
if command -v psql >/dev/null 2>&1; then
  echo "  🛠️  使用 psql 执行..."
  # shellcheck disable=SC1091
  export $(grep -v '^#' .env | xargs)
  # 分割语句执行，忽略已存在
  node -e "
    const { Client } = require('pg');
    const fs = require('fs');
    const conn = process.env.DIRECT_URL;
    const ddl = fs.readFileSync('$DDL_FILE','utf8');
    const stmts = ddl
      .replace(/\/\/.*?\n/g,'')
      .replace(/--.*?\n/g,'')
      .split(';')
      .map(s=>s.trim())
      .filter(Boolean);
    (async()=>{
      const c = new Client({connectionString:conn});
      await c.connect();
      console.log('  ✅ 已连接 Supabase');
      let ok=0,skip=0,fail=0;
      for (const s of stmts) {
        try { await c.query(s); ok++; process.stdout.write('\\r  执行中... '+ok+' 成功'); }
        catch(e){
          const m=e.message||'';
          if(m.includes('already exists')||m.includes('42P07')||m.includes('duplicate')){ skip++; }
          else { fail++; console.log('\\n  ❌ 失败:',m.split('\\n')[0]); console.log('    SQL:',s.slice(0,80)); }
        }
      }
      console.log('');
      await c.end();
      console.log('  📊 结果: 成功='+ok+' 跳过='+skip+' 失败='+fail);
      if (fail>0) process.exit(1);
    })().catch(e=>{console.error(e);process.exit(1)});
  "
  echo "  ✅ DDL 执行完成"
else
  echo "  ⚠️  psql 未找到，尝试使用 node pg..."
  if node -e "require('pg')" 2>/dev/null; then
    node -e "
      const { Client } = require('pg');
      const fs = require('fs');
      require('dotenv').config();
      const conn = process.env.DIRECT_URL;
      if (!conn) { console.error('❌ DIRECT_URL 未加载'); process.exit(1); }
      const ddl = fs.readFileSync('$DDL_FILE','utf8');
      const stmts = ddl
        .replace(/--.*?\n/g,'')
        .split(';')
        .map(s=>s.trim())
        .filter(Boolean);
      (async()=>{
        const c = new Client({connectionString:conn});
        await c.connect();
        console.log('  ✅ 已连接 Supabase');
        let ok=0,skip=0,fail=0;
        for (const s of stmts) {
          try { await c.query(s); ok++; process.stdout.write('\\r  执行中... '+ok+' 成功'); }
          catch(e){
            const m=e.message||'';
            if(m.includes('already exists')||m.includes('42P07')||m.includes('duplicate')){ skip++; }
            else { fail++; console.log('\\n  ❌ 失败:',m.split('\\n')[0]); }
          }
        }
        console.log('');
        await c.end();
        console.log('  📊 结果: 成功='+ok+' 跳过='+skip+' 失败='+fail);
        if (fail>0) process.exit(1);
      })().catch(e=>{console.error(e);process.exit(1)});
    "
    echo "  ✅ DDL 执行完成"
  else
    echo "  ❌ 缺少 pg 模块，请先确保 npm install 完成"
    echo "  💡 或者：去 Supabase 网页 SQL Editor 手动执行以下文件内容："
    echo "     $DDL_FILE"
    exit 1
  fi
fi
echo ""

# ---------- Step 5: Prisma db pull + generate ----------
echo "[5/6] 🗂️  Prisma db pull + generate"
npx prisma db pull
echo "  ✅ db pull 完成"
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
echo "下一步运行：npm run dev   # 启动开发服务器"
echo ""
