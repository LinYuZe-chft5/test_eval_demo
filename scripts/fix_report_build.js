const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'report', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 修复所有可能的中文正则表达式问题
// 1. 修复低信度正则
content = content.replace(
  /\/低信度\|credibility\|low\/i\.test/g,
  '/low|credibility|l/i.test'
);

// 2. 检查是否有其他中文在正则中
const lines = content.split('\n');
let fixes = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('/') && /[^\x00-\x7F]/.test(lines[i])) {
    // 检查是否是正则表达式中的中文
    const regexMatch = lines[i].match(/\/[^/]*[^\x00-\x7F][^/]*\/[gimsuy]*/);
    if (regexMatch) {
      console.log(`发现可能的中文正则在第 ${i + 1} 行: ${lines[i].trim().substring(0, 80)}`);
      fixes++;
    }
  }
}

fs.writeFileSync(filePath, content, 'utf8');

if (fixes === 0) {
  console.log('✅ 没有发现中文正则问题');
} else {
  console.log(`⚠️ 发现 ${fixes} 处可能的中文正则问题，请手动检查`);
}

console.log('修复完成！');
