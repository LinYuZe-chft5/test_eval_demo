/**
 * scripts/run_ddl.ts
 * 直接用 pg 客户端执行 DDL SQL 文件（不依赖 Prisma，避免空 schema 验证报错）
 * 用法：npx tsx scripts/run_ddl.ts
 */
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as dns from 'dns';

// 强制 IPv4 优先（解决 Codespaces IPv6 ENETUNREACH 问题）
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) { /* Node < 16.4 兼容忽略 */ }

// 加载 .env
dotenv.config();

/**
 * 解析 PostgreSQL 连接字符串
 * 返回 { user, password, host, port, database, options }
 * 同时把 hostname 强制解析为 IPv4 地址（解决 Codespaces IPv6 ENETUNREACH）
 */
async function resolveConnection(connStr: string) {
  // postgresql://user:pass@host:port/db?opt=val
  const m = connStr.match(/^postgresql?:\/\/([^:]+):([^@]+)@([^/:?]+)(?::(\d+))?(?:\/([^?]+))?(?:\?(.*))?$/);
  if (!m) throw new Error('无法解析连接字符串:' + connStr.slice(0, 40) + '...');
  const [, user, password, host, portStr, database, queryStr] = m;
  const port = parseInt(portStr || '5432', 10);

  // 强制将 hostname 解析为 IPv4
  let resolvedHost = host;
  try {
    const addresses = await dns.promises.lookup(host, { family: 4 });
    if (addresses?.address) {
      resolvedHost = addresses.address;
      console.log(`[DDL] 🌐 DNS 解析: ${host} → ${resolvedHost} (IPv4)`);
    }
  } catch (e: any) {
    console.log(`[DDL] ⚠️  DNS 解析失败，尝试直接连接 hostname。错误: ${e.message}`);
  }

  return {
    user,
    password: decodeURIComponent(password),
    host: resolvedHost,
    port,
    database: database || 'postgres',
    ssl: { rejectUnauthorized: false }, // Supabase 需要 SSL 但接受自签
    connectionTimeoutMillis: 15000,
  };
}

const DDL_FILE = path.join(
  __dirname,
  '..',
  '初始资料',
  'codex诊断应用文档包',
  'Codex_03_数据库DDL.sql'
);

/**
 * 按分号分割 SQL 语句（忽略字符串内、注释内的分号）
 */
function splitStatements(sql: string): string[] {
  const result: string[] = [];
  let buf = '';
  let inStr: string | null = null;   // ' 或 "
  let dollarTag: string | null = null; // $$ 或 $tag$
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1] || '';
    const rest = sql.slice(i);

    // 行注释
    if (inLineComment) {
      buf += c;
      if (c === '\n') inLineComment = false;
      continue;
    }
    // 块注释
    if (inBlockComment) {
      buf += c;
      if (c === '*' && next === '/') {
        inBlockComment = false;
        buf += next;
        i++;
      }
      continue;
    }
    // 进入行注释
    if (!inStr && !dollarTag && c === '-' && next === '-') {
      inLineComment = true;
      buf += c;
      continue;
    }
    // 进入块注释
    if (!inStr && !dollarTag && c === '/' && next === '*') {
      inBlockComment = true;
      buf += c;
      continue;
    }
    // 进入/退出 dollar 字符串
    if (!inStr && !inLineComment && !inBlockComment) {
      if (!dollarTag) {
        const m = rest.match(/^\$([A-Za-z0-9_]*)\$/);
        if (m) {
          dollarTag = m[0];
          buf += dollarTag;
          i += dollarTag.length - 1;
          continue;
        }
      } else {
        if (rest.startsWith(dollarTag)) {
          buf += dollarTag;
          i += dollarTag.length - 1;
          dollarTag = null;
          continue;
        }
      }
    }
    // 字符串
    if (inStr) {
      buf += c;
      if (c === inStr && sql[i - 1] !== '\\') {
        inStr = null;
      }
      continue;
    }
    if (!dollarTag && !inLineComment && !inBlockComment && (c === "'" || c === '"')) {
      inStr = c;
      buf += c;
      continue;
    }

    // 分号
    if (c === ';' && !inStr && !dollarTag && !inLineComment && !inBlockComment) {
      if (buf.trim()) result.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim()) result.push(buf.trim());
  return result;
}

async function main() {
  const connStr = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connStr) {
    console.error('[DDL] ❌ DIRECT_URL/DATABASE_URL 未找到，请检查 .env');
    process.exit(1);
  }

  // 打印脱敏后的连接串
  const masked = connStr.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  console.log('[DDL] 🔌 连接 Supabase:', masked);

  if (!fs.existsSync(DDL_FILE)) {
    console.error('[DDL] ❌ DDL 文件不存在:', DDL_FILE);
    process.exit(1);
  }

  const sql = fs.readFileSync(DDL_FILE, 'utf8');
  const stmts = splitStatements(sql);
  console.log(`[DDL] 📋 解析出 ${stmts.length} 条 SQL 语句`);

  // 关键：手动解析连接串 + 强制 IPv4 DNS 解析 + SSL 配置
  const connConfig = await resolveConnection(connStr);
  const client = new Client(connConfig);
  try {
    await client.connect();
    console.log('[DDL] ✅ 数据库连接成功\n');

    let ok = 0, skip = 0, fail = 0;
    const fails: string[] = [];

    for (let i = 0; i < stmts.length; i++) {
      const s = stmts[i];
      try {
        await client.query(s);
        ok++;
        process.stdout.write(
          `\r[DDL] ⏳  进度: ${String(i + 1).padStart(2, ' ')}/${stmts.length}  ` +
          `✅${ok}  ⚠️${skip}  ❌${fail}`
        );
      } catch (e: any) {
        const m = (e.message || '').split('\n')[0];
        const code = e.code || '';
        // 已存在类错误 -> 跳过（PostgreSQL 错误码: 42P07=relation exists, 42710=duplicate key, etc）
        if (
          code === '42P07' ||
          code === '42710' ||
          code === '42P06' ||
          code === '42P01' ||
          m.includes('already exists') ||
          m.includes('duplicate')
        ) {
          skip++;
        } else {
          fail++;
          fails.push(`[${i + 1}] ${code || 'ERR'}: ${m}`);
        }
        process.stdout.write(
          `\r[DDL] ⏳  进度: ${String(i + 1).padStart(2, ' ')}/${stmts.length}  ` +
          `✅${ok}  ⚠️${skip}  ❌${fail}`
        );
      }
    }
    process.stdout.write('\n\n');

    console.log('[DDL] ==========================================');
    console.log('[DDL] 📊 执行结果');
    console.log('[DDL] ==========================================');
    console.log(`[DDL]   ✅ 成功: ${ok}`);
    console.log(`[DDL]   ⚠️  跳过: ${skip} (已存在对象)`);
    console.log(`[DDL]   ❌ 失败: ${fail}`);

    if (fails.length) {
      console.log('\n[DDL] ❌ 失败详情:');
      for (const f of fails) console.log('[DDL]  ', f);
    }

    if (fail === 0) {
      console.log('\n[DDL] 🎉 DDL 建表全部完成！');
    } else {
      console.log(`\n[DDL] ⚠️  有 ${fail} 条失败，请检查上方日志`);
      process.exitCode = 1;
    }
  } catch (e: any) {
    console.error('\n[DDL] 💥 连接或执行出错:', e.message || e);
    if (e.code) console.error('[DDL]   错误码:', e.code);
    if (e.message && e.message.includes('ENOTFOUND')) {
      console.error('[DDL]   💡 提示: DNS 解析失败，请检查 PROJECT_REF 是否正确');
    }
    if (e.message && e.message.includes('password authentication')) {
      console.error('[DDL]   💡 提示: 密码错误，请检查 Supabase 密码（@ 需要编码为 %40）');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
