#!/usr/bin/env node
/**
 * scripts/setup_codespaces_env.cjs
 * 在 Codespaces 环境中一键生成 .env 配置文件
 * 运行方式：node scripts/setup_codespaces_env.cjs
 */
const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const envPath = path.join(cwd, '.env');

const envContent = [
  '# ============================================================',
  '# 学科诊断应用 - 环境变量配置 (Codespaces 自动生成)',
  '# ============================================================',
  '',
  '# Supabase 数据库配置',
  `NEXT_PUBLIC_SUPABASE_URL="https://qoagemxoijruustccapl.supabase.co"`,
  `SUPABASE_URL="https://qoagemxoijruustccapl.supabase.co"`,
  `SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvYWdlbXhvaWpydXVzdGNjYXBsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjQyODEyMywiZXhwIjoyMTAyMDA0MTIzfQ.wR6nnUcfQdp3ilNRvKZ3bOqTxzeN4XCEptffUgmYfjQ"`,
  '',
  '# LLM 呆呆兽中转站配置',
  `LLM_API_URL="https://ddshub.cc/v1"`,
  `LLM_API_KEY="sk-98ec263d78dd6c0e151584bdaeef0ad901f110c0dd9d95002d72a161b8bfcff5"`,
  `LLM_MODEL="gpt-5.6-terra"`,
  '',
  '# 管理员与防滥用',
  `ADMIN_USERNAME="admin"`,
  `ADMIN_PASSWORD="change-me-in-production"`,
  `MAX_SESSIONS_PER_IP_PER_HOUR=10`,
  '',
  '# 环境',
  `NODE_ENV=development`,
  '',
].join('\n');

console.log('='.repeat(60));
console.log('🔧 正在生成 .env 配置文件...');
console.log('='.repeat(60));

// 检查是否已存在
if (fs.existsSync(envPath)) {
  console.log(`⚠️  .env 文件已存在 (${envPath})`);
  const backupPath = path.join(cwd, '.env.bak.' + Date.now());
  console.log(`   备份现有文件到: ${backupPath}`);
  fs.copyFileSync(envPath, backupPath);
}

fs.writeFileSync(envPath, envContent, 'utf8');
console.log(`✅ .env 文件已创建: ${envPath}`);

// 验证
const verifyLines = fs.readFileSync(envPath, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
console.log(`📊 包含 ${verifyLines.length} 个有效配置项:`);
verifyLines.forEach(line => {
  const [key] = line.split('=');
  console.log(`   - ${key}`);
});

console.log('\n🚀 请重启开发服务器: npm run dev');
