/**
 * exec_ddl.ts - 通过 node-postgres 直接执行 DDL 建表
 * 不依赖 psql 客户端，直接用 TCP 连接 Supabase PostgreSQL
 */
import { readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  // 1. 读取 .env，用正则提取连接字符串
  console.log('🔍 读取 .env 配置...');
  const envContent = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  const directMatch = envContent.match(/DIRECT_URL="([^"]+)"/);
  if (!directMatch) {
    console.error('❌ .env 中未找到 DIRECT_URL');
    process.exit(1);
  }
  const connStr = directMatch[1];
  console.log('  ✅ 找到连接串:', connStr.replace(/:([^:@]+)@/, ':***@'));

  // 2. 读取 DDL SQL
  const ddlPath = join(
    __dirname,
    '..',
    '初始资料',
    'codex诊断应用文档包',
    'Codex_03_数据库DDL.sql'
  );
  console.log('📖 读取 DDL 文件:', ddlPath);
  let sql = readFileSync(ddlPath, 'utf8');
  console.log('  ✅ DDL 文件大小:', sql.length, '字符');

  // 3. 动态加载 pg 并连接执行
  console.log('\n🚀 连接 Supabase 并执行 DDL...');
  try {
    // @ts-ignore - 动态 import，避免编译期依赖
    const pgMod = await import('pg');
    const { Client } = pgMod.default || pgMod;
    const client = new Client({ connectionString: connStr });
    await client.connect();
    console.log('  ✅ 数据库连接成功');

    // Supabase 默认使用公共 schema，不需要手动 SET search_path
    // 但要确保分号分割，逐条执行
    const statements = splitStatements(sql);
    console.log(`  📋 共解析出 ${statements.length} 条语句`);

    let ok = 0;
    let skipped = 0;
    let failed = 0;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      if (!stmt) { skipped++; continue; }
      try {
        await client.query(stmt);
        ok++;
        process.stdout.write(`\r  执行中... ${ok}/${statements.length - skipped} 条成功`);
      } catch (e: any) {
        const msg = e.message || String(e);
        // 如果是已存在(PGRST/42P07等)，算跳过
        if (msg.includes('already exists') || msg.includes('42P07') || msg.includes('duplicate')) {
          skipped++;
          console.log(`\n  ⚠️  [语句${i+1}] 已存在，跳过: ${msg.split('\n')[0]}`);
        } else {
          failed++;
          console.log(`\n  ❌ [语句${i+1}] 失败: ${msg.split('\n')[0]}`);
          console.log(`     SQL 片段: ${stmt.slice(0, 100)}${stmt.length > 100 ? '...' : ''}`);
        }
      }
    }
    console.log('');

    await client.end();
    console.log('\n' + '='.repeat(60));
    console.log('📋 DDL 执行结果');
    console.log('='.repeat(60));
    console.log(`  成功: ${ok}`);
    console.log(`  跳过: ${skipped}`);
    console.log(`  失败: ${failed}`);

    if (failed === 0) {
      console.log('\n🎉 DDL 建表完成！');
    } else {
      console.log(`\n⚠️  有 ${failed} 条语句失败，请检查日志`);
      process.exitCode = 1;
    }
  } catch (err: any) {
    console.error('\n❌ 执行出错:', err.message || err);
    if (err.code === 'MODULE_NOT_FOUND' || (err.message && err.message.includes("Cannot find module 'pg'"))) {
      console.error('\n💡 缺少 pg 依赖，请先执行: npm install pg @types/pg --save-dev');
    }
    process.exitCode = 1;
  }
}

/**
 * 简易 SQL 语句分割器：按分号分割，忽略字符串内分号
 */
function splitStatements(sql: string): string[] {
  const result: string[] = [];
  let buf = '';
  let inStr: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1] || '';

    if (inLineComment) {
      buf += c;
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      buf += c;
      if (c === '*' && next === '/') { inBlockComment = false; buf += next; i++; }
      continue;
    }
    if (!inStr && c === '-' && next === '-') { inLineComment = true; buf += c; continue; }
    if (!inStr && c === '/' && next === '*') { inBlockComment = true; buf += c; continue; }

    if (inStr) {
      buf += c;
      if (c === inStr && sql[i - 1] !== '\\') inStr = null;
      continue;
    }

    if (c === "'" || c === '"') {
      inStr = c;
      buf += c;
      continue;
    }

    if (c === ';') {
      result.push(buf);
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim()) result.push(buf);
  return result;
}

main();
