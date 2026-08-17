#!/usr/bin/env node
/**
 * scripts/check_schema.cjs
 * 检查数据库表结构中是否包含指定字段
 */

const fs = require('fs');
const path = require('path');

// Manual .env loader
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 缺少 Supabase 环境变量！');
  process.exit(1);
}

const API = `${SUPABASE_URL}/rest/v1`;
const HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function checkColumns() {
  const url = `${API}/rpc/pg_query`;
  const sql = `
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'questions'
    AND column_name IN ('radar_dimensions', 'kp_name');
  `;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });

    if (response.status === 404) {
      console.log('⚠️  pg_query RPC 不存在，改用 information_schema 查询...');
      return checkColumnsViaAPI();
    }

    if (!response.ok) {
      console.error('❌ 查询失败:', response.status, await response.text());
      return;
    }

    const data = await response.json();
    const columns = Array.isArray(data) ? data : [];

    console.log('\n📋 questions 表字段检查结果：');
    console.log('=' .repeat(50));

    const targetColumns = ['radar_dimensions', 'kp_name'];
    for (const col of targetColumns) {
      const found = columns.find(c => c.column_name === col);
      if (found) {
        console.log(`  ✅ ${col}  → 类型: ${found.data_type}  默认值: ${found.column_default || '无'}`);
      } else {
        console.log(`  ❌ ${col}  → 不存在！需要添加`);
      }
    }

    // 检查是否需要添加字段
    const missing = targetColumns.filter(col => !columns.find(c => c.column_name === col));
    if (missing.length > 0) {
      console.log('\n🔧 需要执行以下 SQL 添加字段：');
      console.log('```sql');
      for (const col of missing) {
        if (col === 'radar_dimensions') {
          console.log(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS ${col} JSONB DEFAULT '[]';`);
        } else if (col === 'kp_name') {
          console.log(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS ${col} TEXT DEFAULT '';`);
        }
      }
      console.log('```');
    } else {
      console.log('\n✅ 所有必要字段都已存在，可以直接导入题库数据！');
    }
  } catch (err) {
    console.error('❌ 检查失败:', err.message);
  }
}

async function checkColumnsViaAPI() {
  // 使用 PostgREST 查询单个题目记录，看看返回了哪些字段
  const url = `${API}/questions?select=id,radar_dimensions,kp_name&limit=1`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: HEADERS,
    });

    if (!response.ok) {
      console.error('❌ 查询失败:', response.status, await response.text());
      return;
    }

    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const row = data[0];
      console.log('\n📋 字段检查结果（通过查询题目数据）：');
      console.log('=' .repeat(50));
      
      if ('radar_dimensions' in row) {
        console.log(`  ✅ radar_dimensions 字段存在，当前值: ${JSON.stringify(row.radar_dimensions)}`);
      } else {
        console.log(`  ❌ radar_dimensions 字段不存在！`);
      }
      
      if ('kp_name' in row) {
        console.log(`  ✅ kp_name 字段存在，当前值: ${JSON.stringify(row.kp_name)}`);
      } else {
        console.log(`  ❌ kp_name 字段不存在！`);
      }
    } else {
      console.log('⚠️ 题库为空，先执行导入脚本再检查字段');
    }
  } catch (err) {
    console.error('❌ 检查失败:', err.message);
  }
}

// 执行检查
checkColumns();
