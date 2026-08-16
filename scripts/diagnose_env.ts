#!/usr/bin/env tsx
/**
 * scripts/diagnose_env.ts
 * 
 * 环境变量诊断脚本 - 帮助排查 .env 加载问题
 * 
 * 用法：npx tsx scripts/diagnose_env.ts
 */

import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
console.log('='.repeat(60));
console.log('环境变量诊断脚本');
console.log('='.repeat(60));
console.log('当前工作目录:', cwd);
console.log('');

// 1. 检查 .env 文件是否存在
console.log('【1】检查 .env 文件');
const envFilePaths = [
  path.join(cwd, '.env'),
  path.join(cwd, '.env.local'),
  path.join(cwd, '.env.development'),
];

let foundEnvFile = '';
for (const envPath of envFilePaths) {
  if (fs.existsSync(envPath)) {
    console.log(`  ✅ 找到: ${envPath}`);
    foundEnvFile = envPath;
  } else {
    console.log(`  ❌ 未找到: ${envPath}`);
  }
}

// 2. 如果找到 .env 文件，检查关键变量
if (foundEnvFile) {
  console.log('\n【2】检查 .env 文件内容');
  try {
    const content = fs.readFileSync(foundEnvFile, 'utf8');
    const requiredKeys = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ];
    
    for (const key of requiredKeys) {
      const regex = new RegExp(`^${key}=(.*)$`, 'm');
      const match = content.match(regex);
      if (match && match[1].trim()) {
        const value = match[1].trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        if (value.length > 10) {
          console.log(`  ✅ ${key} = ${value.slice(0, 10)}...${value.slice(-4)} (长度: ${value.length})`);
        } else {
          console.log(`  ✅ ${key} = ${value}`);
        }
      } else {
        console.log(`  ❌ ${key} 未设置或为空`);
      }
    }
  } catch (err: any) {
    console.log(`  ❌ 读取文件失败: ${err.message}`);
  }
} else {
  console.log('\n⚠️  未找到任何 .env 文件！');
  console.log('');
  console.log('【解决方案】');
  console.log('  1. 从 .env.example 复制模板：');
  console.log('     cp .env.example .env');
  console.log('');
  console.log('  2. 编辑 .env 文件，填入实际值：');
  console.log('     - NEXT_PUBLIC_SUPABASE_URL=https://qoagemxoijruustccapl.supabase.co');
  console.log('     - SUPABASE_URL=https://qoagemxoijruustccapl.supabase.co');
  console.log('     - SUPABASE_SERVICE_ROLE_KEY=<你的密钥>');
  console.log('');
  console.log('  3. 重启开发服务器：npm run dev');
  process.exit(1);
}

// 3. 检查 process.env 是否已经加载了这些变量
console.log('\n【3】检查 process.env 中的环境变量');
const envChecks = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
let allSet = true;

for (const key of envChecks) {
  const value = process.env[key];
  if (value && value.length > 0) {
    console.log(`  ✅ process.env.${key} 已设置 (长度: ${value.length})`);
  } else {
    console.log(`  ❌ process.env.${key} 未设置`);
    allSet = false;
  }
}

// 4. 总结
console.log('\n【诊断结果】');
if (allSet) {
  console.log('  ✅ 环境变量配置正确！');
  console.log('  可以启动服务器进行测试：npm run dev');
} else {
  console.log('  ❌ 环境变量配置不完整！');
  console.log('  请按照以下步骤修复：');
  console.log('');
  console.log('  Step 1: 编辑 .env 文件');
  console.log('  Step 2: 确保以下变量已设置：');
  console.log('    - NEXT_PUBLIC_SUPABASE_URL');
  console.log('    - SUPABASE_URL');
  console.log('    - SUPABASE_SERVICE_ROLE_KEY');
  console.log('');
  console.log('  Step 3: 重启开发服务器');
}

console.log('\n' + '='.repeat(60));
