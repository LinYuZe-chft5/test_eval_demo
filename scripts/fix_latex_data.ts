/**
 * scripts/fix_latex_data.ts
 * 修复种子数据中的LaTeX反斜杠问题
 * 
 * 运行：npx tsx scripts/fix_latex_data.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(__dirname, 'data');

// 需要修复的LaTeX命令（按频率排序）
const LATEX_COMMANDS = [
  'frac', 'sqrt', 'times', 'div', 'pm', 'mp',
  'circ', 'leq', 'geq', 'neq', 'sim', 'approx',
  'sum', 'min', 'max', 'prod',
  'cdot', 'cdots', 'ldots', 'dots',
  'overline', 'vec', 'hat', 'bar', 'dot',
  'left', 'right', 'middle',
  'begin', 'end', 'array', 'hline', 'vspace', 'hspace',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta',
  'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu',
  'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau',
  'upsilon', 'phi', 'chi', 'psi', 'omega',
  'triangle', 'angle', 'perp', 'parallel', 'infty',
  'forall', 'exists', 'notin', 'subset', 'subseteq',
  'supset', 'cup', 'cap', 'emptyset',
  'oplus', 'ominus', 'otimes', 'oslash',
  'to', 'leftarrow', 'rightarrow', 'Rightarrow', 'Leftarrow',
  'mapsto', 'longmapsto', 'uparrow', 'downarrow',
  'le', 'ge', 'll', 'gg',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'log', 'ln', 'lg', 'exp',
];

/**
 * 修复文本中的LaTeX反斜杠
 * 核心逻辑：
 * 1. 查找所有缺失反斜杠的LaTeX命令
 * 2. 确保命令前面没有反斜杠（避免双重转义）
 * 3. 确保命令后面跟正确的上下文
 */
function fixLatexInText(text: string): string {
  if (!text) return text;
  let result = text;

  // 先修复Unicode符号为LaTeX
  result = result.replace(/×/g, '\\times');
  result = result.replace(/÷/g, '\\div');
  result = result.replace(/±/g, '\\pm');
  result = result.replace(/≤/g, '\\leq');
  result = result.replace(/≥/g, '\\geq');
  result = result.replace(/≠/g, '\\neq');
  result = result.replace(/·/g, '\\cdot');
  result = result.replace(/°/g, '\\circ');
  result = result.replace(/∞/g, '\\infty');
  result = result.replace(/∠/g, '\\angle');
  result = result.replace(/⊥/g, '\\perp');
  result = result.replace(/△/g, '\\triangle');

  // 修复缺失反斜杠的LaTeX命令
  for (const cmd of LATEX_COMMANDS) {
    // 模式：前面没有反斜杠，后面跟 { [ 空格 数字 逗号 句号 或结尾
    // 但要避免匹配正常英文单词的一部分（如 "times" 在普通文本中）
    const pattern = new RegExp(
      `(?<!\\\\)${cmd}(?=[{[\\s0-9,.;]|$)`,
      'g'
    );
    result = result.replace(pattern, `\\${cmd}`);
  }

  // 特殊修复：^后直接跟命令的情况
  for (const cmd of ['times', 'div', 'pm', 'cdot', 'frac', 'sqrt']) {
    const pattern = new RegExp(
      `\\^${cmd}(?=[{[\\s0-9]|$)`,
      'g'
    );
    result = result.replace(pattern, `^\\${cmd}`);
  }

  return result;
}

/**
 * 处理单个题目的所有文本字段
 */
function fixQuestionData(q: any): any {
  if (!q) return q;

  // 修复题干
  if (q.stem) q.stem = fixLatexInText(q.stem);
  
  // 修复选项
  if (Array.isArray(q.options)) {
    for (const opt of q.options) {
      if (opt.text) opt.text = fixLatexInText(opt.text);
    }
  }
  
  // 修复分步题prompt
  if (Array.isArray(q.steps)) {
    for (const step of q.steps) {
      if (step.prompt) step.prompt = fixLatexInText(step.prompt);
      if (step.answer) step.answer = fixLatexInText(step.answer);
    }
  }
  
  // 修复解答
  if (q.solution) q.solution = fixLatexInText(q.solution);
  
  // 修复变式
  if (q.variant_stem) q.variant_stem = fixLatexInText(q.variant_stem);
  if (q.variant_answer) q.variant_answer = fixLatexInText(q.variant_answer);
  
  // 修复改进建议
  if (q.improvement_tip) q.improvement_tip = fixLatexInText(q.improvement_tip);

  return q;
}

/**
 * 处理JSON文件
 */
function processJsonFile(fileName: string): void {
  const filePath = join(DATA_DIR, fileName);
  console.log(`\n📖 处理: ${fileName}`);
  
  const raw = readFileSync(filePath, 'utf8');
  const questions: any[] = JSON.parse(raw);
  
  let fixedCount = 0;
  for (let i = 0; i < questions.length; i++) {
    const before = JSON.stringify(questions[i]);
    questions[i] = fixQuestionData(questions[i]);
    const after = JSON.stringify(questions[i]);
    if (before !== after) {
      fixedCount++;
      console.log(`  ✅ 修复第 ${i + 1} 题`);
    }
  }
  
  writeFileSync(filePath, JSON.stringify(questions, null, 2), 'utf8');
  console.log(`📊 共修复 ${fixedCount} / ${questions.length} 题`);
}

// 处理所有种子数据文件
console.log('========================================');
console.log('LaTeX反斜杠修复工具');
console.log('========================================');

processJsonFile('s3_seed.json');
processJsonFile('s6_seed.json');
processJsonFile('questions_seed.json');

console.log('\n========================================');
console.log('✅ 修复完成！请重新运行种子导入脚本：');
console.log('  npm run seed:s3_s6');
console.log('  npm run seed');
console.log('========================================');
