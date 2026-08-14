const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'data', 'questions_seed.json');

// ========== 关键：先读取原始文本，在 JSON.parse 之前修复 ==========
let raw = fs.readFileSync(filePath, 'utf8');

// LaTeX 命令白名单（需要确保有反斜杠前缀）
const latexCommands = [
  'frac', 'sqrt', 'times', 'div', 'angle', 'circ', 'leq', 'geq', 'neq', 'sim',
  'pm', 'mp', 'sum', 'min', 'max', 'cdot', 'cdots', 'ldots', 'overline',
  'vec', 'hat', 'bar', 'dot', 'left', 'right', 'begin', 'end', 'array', 'hline',
  'triangle', 'perp', 'parallel', 'infty', 'alpha', 'beta', 'gamma', 'delta',
  'theta', 'pi', 'sigma', 'lambda', 'mu', 'otimes', 'cap', 'cup', 'emptyset',
  'forall', 'exists', 'in', 'notin', 'subset', 'supset', 'cdot',
  'mathbb', 'mathcal', 'text', 'operatorname'
];

// 构建正则：匹配所有单反斜杠 + LaTeX 命令名（后面跟 { 或 [ 或字母边界）
// 注意：必须排除已经是双反斜杠的情况
// 思路：找所有 \frac, \div 等，如果前面只有一个 \，就变成 \\frac
// 更安全的做法：遍历每个命令，把 \cmd 替换为 \\cmd（但只替换有问题的）

console.log('=== LaTeX JSON 原始文本修复 ===');
console.log('原始文件大小:', raw.length, '字节');

// 统计有多少单反斜杠+cmd 需要修复
let totalFixes = 0;

// 对每个 LaTeX 命令，检查并修复单反斜杠
for (const cmd of latexCommands) {
  // 匹配：\cmd 但不是 \\cmd（前面只有一个反斜杠）
  // 后面跟 { [ 或字母数字（确保是命令开头）
  // 排除 \n \t \" 等 JSON 转义序列
  const re = new RegExp(`(?<!\\\\)\\\\${cmd}(?=[{\\[a-zA-Z0-9])`, 'g');
  const matches = raw.match(re);
  if (matches) {
    totalFixes += matches.length;
    // 修复：单反斜杠 → 双反斜杠
    raw = raw.replace(re, `\\\\${cmd}`);
  }
}

console.log(`检测到 ${totalFixes} 处单反斜杠 LaTeX 命令，已修复为双反斜杠`);

// 现在可以安全地 JSON.parse
const questions = JSON.parse(raw);
console.log(`JSON 解析成功，共 ${questions.length} 道题`);

// 验证第7题
const q7 = questions.find(q => q.day_tag === 1 && q.seq_no === 7);
if (q7) {
  const hasFrac = q7.stem.includes('\\frac');
  console.log(`第7题 stem 包含 \\frac: ${hasFrac}`);
  console.log(`第7题 stem 前80字符: ${q7.stem.substring(0, 80)}`);
}

// 验证第1题
const q1 = questions.find(q => q.day_tag === 1 && q.seq_no === 1);
if (q1) {
  const hasTimes = q1.stem.includes('\\times');
  console.log(`第1题 stem 包含 \\times: ${hasTimes}`);
}

fs.writeFileSync(filePath, JSON.stringify(questions, null, 2) + '\n', 'utf-8');

console.log('=== 修复完成 ===');
console.log(`文件已保存: ${filePath}`);
console.log(`新文件大小: ${fs.statSync(filePath).size} 字节`);
