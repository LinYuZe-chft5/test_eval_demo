/**
 * scripts/deploy_to_cloudflare.cjs
 * Cloudflare Pages 部署脚本 - 自动部署到 Cloudflare Pages
 * 
 * 使用方法：
 *   1. 在 Cloudflare Dashboard 创建 Pages 项目并连接 GitHub
 *   2. 运行: node scripts/deploy_to_cloudflare.cjs
 *   3. 或直接使用 Cloudflare Dashboard 手动配置
 * 
 * 也可以直接使用 Cloudflare CLI:
 *   npx wrangler pages deploy .next --project-name=your-project-name
 */

const fs = require('fs');
const path = require('path');

// ===== 环境变量配置 =====
const ENV_VARS = {
  production: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://qoagemxoijruustccapl.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'YOUR_SUPABASE_SERVICE_ROLE_KEY', // 从 Cloudflare Dashboard 配置
    LLM_API_URL: 'https://ddshub.cc/v1',
    LLM_API_KEY: 'YOUR_LLM_API_KEY', // 从 Cloudflare Dashboard 配置
    LLM_MODEL: 'gpt-5.6-terra',
    NODE_ENV: 'production',
  },
  preview: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://qoagemxoijruustccapl.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'YOUR_SUPABASE_SERVICE_ROLE_KEY',
    LLM_API_URL: 'https://ddshub.cc/v1',
    LLM_API_KEY: 'YOUR_LLM_API_KEY',
    LLM_MODEL: 'gpt-5.6-terra',
    NODE_ENV: 'preview',
  },
};

console.log('========================================================');
console.log('  Cloudflare Pages 部署配置');
console.log('========================================================\n');

console.log('【方法1：Cloudflare Dashboard 手动部署】\n');

console.log('1. 打开 https://dash.cloudflare.com/');
console.log('2. 点击 "Workers & Pages" → "Create application"');
console.log('3. 选择 "Pages" → "Connect to Git"');
console.log('4. 选择 GitHub 仓库并授权');
console.log('5. 配置构建设置：');
console.log('   - Framework preset: Next.js');
console.log('   - Build command: next build');
console.log('   - Build output directory: .next');
console.log('   - Install command: npm install\n');

console.log('6. 添加环境变量（Settings → Environment variables）：\n');

for (const [env, vars] of Object.entries(ENV_VARS)) {
  console.log(`   [${env} 环境]`);
  for (const [key, value] of Object.entries(vars)) {
    const displayValue = value.includes('YOUR_') ? value : value;
    console.log(`     ${key} = ${displayValue}`);
  }
  console.log('');
}

console.log('7. 点击 "Save and Deploy" 开始部署\n');

console.log('========================================================');
console.log('【方法2：使用 Wrangler CLI 部署】\n');

console.log('# 安装 Wrangler CLI');
console.log('npm install -g wrangler\n');

console.log('# 登录 Cloudflare');
console.log('wrangler login\n');

console.log('# 构建项目');
console.log('npm run build\n');

console.log('# 部署到 Cloudflare Pages');
console.log('wrangler pages deploy .next --project-name=diag-app\n');

console.log('# 设置环境变量（可选）');
console.log('wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY');
console.log('wrangler pages secret put LLM_API_KEY\n');

console.log('========================================================');
console.log('【重要提示】\n');

console.log('1. SUPABASE_SERVICE_ROLE_KEY 和 LLM_API_KEY 必须在 Cloudflare Dashboard 中配置');
console.log('   不要将真实密钥写入代码仓库！\n');

console.log('2. Cloudflare Pages 免费版限制：');
console.log('   - 每月 500 次构建请求');
console.log('   - 无限带宽（但高流量可能被限流）');
console.log('   - 适用于小型项目/演示用途\n');

console.log('3. 国内访问优化：');
console.log('   Cloudflare Pages 域名在国内访问速度比 Vercel 好');
console.log('   如需进一步优化，可考虑绑定自定义域名 + CDN 加速\n');

console.log('========================================================');
console.log('部署完成后：');
console.log('  1. 访问 Cloudflare 分配的子域名 (xxx.pages.dev)');
console.log('  2. 测试初一/初二/初三身份测评');
console.log('  3. 验证报告生成、雷达图、错题分析等功能\n');
console.log('========================================================');
