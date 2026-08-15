/**
 * scripts/fix_data_cjs.js
 * CommonJS版本的数据修复脚本
 * 用于修复LaTeX反斜杠和分步题prompt
 * 
 * 运行：node scripts/fix_data_cjs.js
 */
const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const DATA_DIR = join(__dirname, 'data');

// 需要修复的LaTeX命令
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

// 修复LaTeX反斜杠
function fixLatexInText(text) {
  if (!text) return text;
  let result = text;

  // Unicode符号转LaTeX
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
    const pattern = new RegExp(`(?<!\\\\)${cmd}(?=[{[\\s0-9,.;]|$)`, 'g');
    result = result.replace(pattern, `\\${cmd}`);
  }

  // 特殊修复：^后直接跟命令
  for (const cmd of ['times', 'div', 'pm', 'cdot', 'frac', 'sqrt']) {
    const pattern = new RegExp(`\\^${cmd}(?=[{[\\s0-9]|$)`, 'g');
    result = result.replace(pattern, `^\\${cmd}`);
  }

  return result;
}

// 修复单个题目的LaTeX
function fixQuestionLatex(q) {
  if (!q) return q;
  if (q.stem) q.stem = fixLatexInText(q.stem);
  if (Array.isArray(q.options)) {
    for (const opt of q.options) {
      if (opt.text) opt.text = fixLatexInText(opt.text);
    }
  }
  if (Array.isArray(q.steps)) {
    for (const step of q.steps) {
      if (step.prompt) step.prompt = fixLatexInText(step.prompt);
      if (step.answer) step.answer = fixLatexInText(step.answer);
    }
  }
  if (q.solution) q.solution = fixLatexInText(q.solution);
  if (q.variant_stem) q.variant_stem = fixLatexInText(q.variant_stem);
  if (q.variant_answer) q.variant_answer = fixLatexInText(q.variant_answer);
  if (q.improvement_tip) q.improvement_tip = fixLatexInText(q.improvement_tip);
  return q;
}

// 转换分步题prompt为引导性问题
function convertPromptToQuestion(prompt, stepSeq, totalSteps) {
  if (!prompt) return `第${stepSeq}步：`;
  
  if (/[？?]$/.test(prompt.trim())) {
    return prompt;
  }
  
  let converted = prompt;
  
  // 常见模式转换
  converted = converted.replace(/^由(.+?)得(.+?)$/, '由$1，可以得到什么？请写出推导过程：');
  converted = converted.replace(/^由(.+?)推出(.+?)$/, '由$1可以推出什么？请写出推理依据：');
  converted = converted.replace(/^过点(.+?)作(.+?)$/, '请过点$1作辅助线$2，并说明这样作的目的：');
  converted = converted.replace(/^连接(.+?)$/, '请连接$1，并说明这样作的目的：');
  converted = converted.replace(/^在(.+?)中[，,](.+?)$/, '在$1中，请利用$2的相关性质/定理：');
  converted = converted.replace(/^计算(.+?)$/, '请计算$1，并写出计算过程：');
  converted = converted.replace(/^化简(.+?)$/, '请化简$1，并写出化简过程：');
  converted = converted.replace(/^(?:解|求解)(?:方程|不等式)(.+?)$/, '请解$1，并写出解题过程：');
  converted = converted.replace(/^(因|因为)(.+?)$/, '因$1，由此可以得出什么结论？');
  converted = converted.replace(/^(所以|∴)(.+?)$/, '所以$1，请说明推理依据：');
  converted = converted.replace(/^答[：:](.+?)$/, '答案是$1，请验证这个结果：');
  
  // 如果没有被特殊模式转换，添加引导词
  if (converted === prompt) {
    converted = `请完成以下推理步骤：${prompt}`;
  }
  
  return converted;
}

// 修复分步题prompt
function fixStepPrompts(questions) {
  let fixed = 0;
  const stepQuestions = questions.filter(q => q.q_type === 'step' && Array.isArray(q.steps));
  
  for (const q of stepQuestions) {
    const totalSteps = q.steps.length;
    for (let i = 0; i < q.steps.length; i++) {
      const step = q.steps[i];
      if (step.prompt) {
        const original = step.prompt;
        step.prompt = convertPromptToQuestion(step.prompt, i + 1, totalSteps);
        if (step.prompt !== original) {
          fixed++;
        }
      }
      // 保存参考答案到reference_answer，清空answer让学生填写
      if (step.answer && step.answer.trim()) {
        step.reference_answer = step.answer;
        step.answer = '';
      }
    }
  }
  
  return { fixed, total: stepQuestions.length };
}

// 处理单个文件
function processFile(fileName) {
  const filePath = join(DATA_DIR, fileName);
  console.log(`\n📖 处理: ${fileName}`);
  
  const raw = readFileSync(filePath, 'utf8');
  const questions = JSON.parse(raw);
  
  // 修复LaTeX
  let latexFixed = 0;
  for (let i = 0; i < questions.length; i++) {
    const before = JSON.stringify(questions[i]);
    questions[i] = fixQuestionLatex(questions[i]);
    const after = JSON.stringify(questions[i]);
    if (before !== after) {
      latexFixed++;
    }
  }
  
  // 修复分步题
  const { fixed: stepFixed, total } = fixStepPrompts(questions);
  
  writeFileSync(filePath, JSON.stringify(questions, null, 2), 'utf8');
  
  console.log(`  ✅ LaTeX修复: ${latexFixed} 题`);
  console.log(`  ✅ 分步题修复: ${stepFixed} / ${total} 题`);
  
  return { latexFixed, stepFixed, total };
}

// 主程序
console.log('========================================');
console.log('数据修复工具 (LaTeX + 分步题)');
console.log('========================================\n');

const files = ['s3_seed.json', 's6_seed.json', 'questions_seed.json'];
let totalLatexFixed = 0;
let totalStepFixed = 0;

for (const fileName of files) {
  try {
    const { latexFixed, stepFixed } = processFile(fileName);
    totalLatexFixed += latexFixed;
    totalStepFixed += stepFixed;
  } catch (err) {
    console.error(`❌ ${fileName} 处理失败:`, err.message);
  }
}

console.log('\n========================================');
console.log(`✅ 完成！LaTeX修复 ${totalLatexFixed} 处，分步题修复 ${totalStepFixed} 处`);
console.log('========================================');
console.log('\n请在Codespaces中重新运行：');
console.log('  npm run seed:s3_s6');
