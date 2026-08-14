#!/bin/bash
# 修复报告页 page.tsx 构建错误
# 运行方式: bash scripts/fix_report_page.sh

echo "=== 修复报告页 page.tsx ==="

FILE="app/report/page.tsx"

if [ ! -f "$FILE" ]; then
  echo "错误: 文件不存在 $FILE"
  exit 1
fi

echo "1. 备份原文件..."
cp "$FILE" "${FILE}.backup"

echo "2. 执行 Node.js 修复..."
node -e "
const fs = require('fs');
let c = fs.readFileSync('$FILE', 'utf8');

// 问题：正则表达式 /low|credibility|l/i 在 JSX 上下文中解析失败
// 解决方案：将正则提取为变量，避免在箭头函数中内联使用

// 查找并替换有问题的行
const oldLine = 'draft.confidence_flags.some((f: any) => /low|credibility|l/i.test(f.flag));';
const newLine = 'const credibilityPattern = /low|credibility|l/i;\\n    draft.confidence_flags.some((f: any) => credibilityPattern.test(f.flag));';

if (c.includes(oldLine)) {
  c = c.replace(oldLine, newLine);
  fs.writeFileSync('$FILE', c);
  console.log('修复成功：正则表达式已提取为变量');
} else {
  console.log('未发现需要修复的正则表达式（可能已修复）');
  console.log('检查当前行内容...');
  const lines = c.split('\\n');
  lines.forEach((line, idx) => {
    if (line.includes('confidence_flags') || line.includes('credibility')) {
      console.log('第', idx + 1, '行:', line.trim().substring(0, 80));
    }
  });
}
"

echo "3. 验证修复结果..."
grep -n "credibilityPattern\\|lowCredibility" "$FILE" | head -3

echo ""
echo "=== 修复完成 ==="
echo "如果修复成功，请重启 dev server：npm run dev"
echo "如果修复失败，请手动检查 app/report/page.tsx 第 112 行附近"
