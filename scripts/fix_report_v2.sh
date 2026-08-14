#!/bin/bash
# 彻底修复报告页 page.tsx
# 如果 git pull 不生效或缓存问题，直接用此脚本修复

cd /workspace/test_eval_demo

echo "=== 彻底修复报告页 ==="

# 方法1: 尝试拉取最新
echo "1. 拉取最新代码..."
git fetch origin
git reset --hard origin/main

# 方法2: 直接用 Node.js 修复文件
echo "2. 执行修复..."
node << 'SCRIPT'
const fs = require('fs');
const file = 'app/report/page.tsx';

if (!fs.existsSync(file)) {
  console.log('文件不存在!');
  process.exit(1);
}

let c = fs.readFileSync(file, 'utf8');

// 查找并显示当前问题行
const lines = c.split('\n');
console.log('检查当前文件内容...');

// 检查各种可能的问题模式
let fixed = false;

// 模式1: 内联正则
const inlineRegex = /\.some\(\(f: any\) => \/[a-zA-Z|]+\.test\(/;
if (inlineRegex.test(c)) {
  console.log('发现内联正则，提取为变量...');
  c = c.replace(
    /draft\.confidence_flags\.some\(\(f: any\) => \/low\|credibility\|l\/i\.test\(f\.flag\)\)/,
    'const credibilityPattern = /low|credibility|l/i;\n  const lowCredibility = Array.isArray(draft.confidence_flags) &&\n    draft.confidence_flags.some((f: any) => credibilityPattern.test(f.flag))'
  );
  fixed = true;
}

// 模式2: 已经提取变量但可能位置不对
if (!fixed && c.includes('credibilityPattern')) {
  console.log('正则已提取为变量，检查位置...');
  // 确保 credibilityPattern 在使用之前声明
  const hasDecl = c.includes('const credibilityPattern =');
  const hasUse = c.includes('credibilityPattern.test(');
  if (hasDecl && hasUse) {
    console.log('✅ 修复看起来正确');
  }
}

fs.writeFileSync(file, c, 'utf8');
console.log('3. 文件已保存');

// 验证
const result = fs.readFileSync(file, 'utf8');
const lines2 = result.split('\n');
for (let i = 0; i < lines2.length; i++) {
  if (lines2[i].includes('credibility') || lines2[i].includes('confidence_flags')) {
    console.log(`  L${i+1}: ${lines2[i].trim().substring(0, 100)}`);
  }
}
SCRIPT

# 方法3: 清理 Next.js 缓存
echo "3. 清理 Next.js 缓存..."
rm -rf .next/cache
rm -rf .next/turbo

echo ""
echo "=== 完成 ==="
echo "请重启 dev server: npm run dev"
echo "如果仍有问题，请执行: rm -rf .next && npm run dev"
