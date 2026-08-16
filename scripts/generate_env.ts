#!/usr/bin/env tsx
/**
 * scripts/generate_env.ts
 * 
 * 生成 .env 文件 - 交互式询问用户配置，避免 heredoc 复制粘贴导致的空值问题
 * 直接用 Node 写文件，无 bash heredoc 解析风险
 * 
 * 用法：
 *   1) 全交互：    npx tsx scripts/generate_env.ts
 *   2) 单命令非交互：
 *        npx tsx scripts/generate_env.ts \
 *          --project-ref qoagemxoijruustccapl \
 *          --service-key eyJhbGci... \
 *          --llm-key sk-xxxx... \
 *          --overwrite
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env');

interface EnvConfig {
  projectRef: string;
  serviceRoleKey: string;
  llmApiUrl: string;
  llmApiKey: string;
  llmModel: string;
}

function parseArgs(): Partial<EnvConfig> & { overwrite?: boolean } {
  const args = process.argv.slice(2);
  const result: any = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--project-ref' && args[i + 1]) { result.projectRef = args[++i]; }
    else if (a === '--service-key' && args[i + 1]) { result.serviceRoleKey = args[++i]; }
    else if (a === '--llm-url' && args[i + 1]) { result.llmApiUrl = args[++i]; }
    else if (a === '--llm-key' && args[i + 1]) { result.llmApiKey = args[++i]; }
    else if (a === '--llm-model' && args[i + 1]) { result.llmModel = args[++i]; }
    else if (a === '--overwrite') { result.overwrite = true; }
  }
  return result;
}

function ask(question: string, def?: string, sensitive = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    
    const write = (s: string) => process.stdout.write(s);
    const prompt = def ? `${question} [默认: ${def}]: ` : `${question}: `;
    write(prompt);
    
    if (sensitive && process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
      let buf = '';
      process.stdin.on('data', (chunk) => {
        const c = chunk.toString();
        const code = c.charCodeAt(0);
        if (code === 13 || code === 10) { // Enter
          process.stdin.setRawMode(false);
          write('\n');
          rl.close();
          resolve(buf || def || '');
        } else if (code === 127 || code === 8) { // Backspace
          if (buf.length > 0) { buf = buf.slice(0, -1); write('\b \b'); }
        } else if (code === 3) { // Ctrl+C
          process.exit(1);
        } else { buf += c; write('*'); }
      });
    } else {
      rl.question('', (answer) => {
        rl.close();
        resolve(answer.trim() || def || '');
      });
    }
  });
}

function buildEnv(c: EnvConfig): string {
  const supabaseUrl = `https://${c.projectRef}.supabase.co`;
  return [
    '# ===== Supabase 项目配置 =====',
    `NEXT_PUBLIC_SUPABASE_URL="${supabaseUrl}"`,
    `SUPABASE_URL="${supabaseUrl}"`,
    `SUPABASE_SERVICE_ROLE_KEY="${c.serviceRoleKey}"`,
    '',
    '# ===== 管理员账号 =====',
    'ADMIN_USERNAME="admin"',
    'ADMIN_PASSWORD="change-me-in-production"',
    '',
    '# ===== 防滥用 =====',
    'MAX_SESSIONS_PER_IP_PER_HOUR=10',
    '',
    '# ===== LLM API 配置（呆呆兽中转站 / DDShub）=====',
    `LLM_API_URL="${c.llmApiUrl}"`,
    `LLM_API_KEY="${c.llmApiKey}"`,
    `LLM_MODEL="${c.llmModel}"`,
    '',
    '# ===== Node 环境 =====',
    'NODE_ENV=development',
    '',
  ].join('\n');
}

async function main() {
  console.log('='.repeat(60));
  console.log('🎯 .env 文件生成器（零拷贝错误版本）');
  console.log('='.repeat(60));
  console.log('');

  const args = parseArgs();

  if (fs.existsSync(envPath) && !args.overwrite) {
    const ans = await ask(`现有 .env 已存在，是否覆盖？(y/N)`, 'n');
    if (ans.toLowerCase() !== 'y') {
      console.log('→ 已取消');
      process.exit(0);
    }
  }

  // 你的项目固定 PROJECT_REF
  const DEFAULT_PROJECT_REF = 'qoagemxoijruustccapl';
  const DEFAULT_LLM_URL = 'https://ddshub.cc/v1';
  const DEFAULT_LLM_MODEL = 'gpt-5.6-terra';

  const projectRef = args.projectRef || await ask('PROJECT_REF', DEFAULT_PROJECT_REF);
  const serviceRoleKey = args.serviceRoleKey || await ask('SUPABASE_SERVICE_ROLE_KEY（以"eyJhbGci"开头的长密钥）', undefined, true);

  // LLM 配置（可选）
  const useLlm = await ask('是否配置 LLM（呆呆兽中转站）？(Y/n)', 'y');
  let llmApiUrl = '';
  let llmApiKey = '';
  let llmModel = '';
  if (useLlm.toLowerCase() !== 'n') {
    llmApiUrl = args.llmApiUrl || await ask('LLM_API_URL', DEFAULT_LLM_URL);
    llmApiKey = args.llmApiKey || await ask('LLM_API_KEY（sk-开头）', undefined, true);
    llmModel = args.llmModel || await ask('LLM_MODEL', DEFAULT_LLM_MODEL);
  }

  if (!projectRef) { console.error('❌ PROJECT_REF 不能为空'); process.exit(1); }
  if (!serviceRoleKey) { console.error('❌ SERVICE_ROLE_KEY 不能为空'); process.exit(1); }

  const envContent = buildEnv({
    projectRef, serviceRoleKey,
    llmApiUrl: llmApiUrl || DEFAULT_LLM_URL,
    llmApiKey,
    llmModel: llmModel || DEFAULT_LLM_MODEL,
  });

  fs.writeFileSync(envPath, envContent, { encoding: 'utf-8', flag: 'w' });
  console.log('');
  console.log('✅ .env 文件已成功写入:', envPath);
  console.log('');

  // 摘要显示（全部掩码，不泄露任何密钥）
  console.log('【配置摘要】（所有密钥已掩码显示）');
  const supabaseUrl = `https://${projectRef}.supabase.co`;
  console.log(`  SUPABASE_URL        : ${supabaseUrl.slice(0, 16)}...${supabaseUrl.slice(-12)}`);
  console.log(`  SERVICE_ROLE_KEY    : ${serviceRoleKey.slice(0, 10)}...${serviceRoleKey.slice(-6)} (len=${serviceRoleKey.length})`);
  if (llmApiKey) {
    console.log(`  LLM_API_URL         : ${llmApiUrl.slice(0, 16)}...${llmApiUrl.slice(-4)}`);
    console.log(`  LLM_MODEL           : ${llmModel}`);
    console.log(`  LLM_API_KEY         : ${llmApiKey.slice(0, 8)}...${llmApiKey.slice(-6)} (len=${llmApiKey.length})`);
  } else {
    console.log(`  LLM                 : ⚠️  未配置（会自动降级为程序判分+模板报告）`);
  }
  console.log('');
  console.log('下一步：');
  console.log('  1) 运行诊断脚本：  npm run diagnose:env');
  console.log('  2) 启动开发服务器：npm run dev');
}

main().catch(e => { console.error(e); process.exit(1); });
