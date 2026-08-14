const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'data', 'questions_seed.json');
let raw = fs.readFileSync(filePath, 'utf8');

const latexCommands = [
  'frac', 'sqrt', 'times', 'div', 'pm', 'mp', 'circ',
  'leq', 'geq', 'neq', 'sim', 'sum', 'min', 'max',
  'cdot', 'cdots', 'ldots', 'overline', 'vec', 'hat',
  'bar', 'dot', 'left', 'right', 'begin', 'end', 'array',
  'hline', 'triangle', 'angle', 'perp', 'parallel', 'infty',
  'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi', 'sigma',
  'lambda', 'mu', 'otimes', 'cap', 'cup', 'emptyset', 'forall',
  'exists', 'subset', 'supset', 'mathbb', 'mathcal', 'text',
  'operatorname', 'simeq', 'approx', 'cong', 'equiv',
  'prec', 'succ', 'subseteq', 'supseteq', 'nsubset', 'nsupset',
  'mid', 'nparallel', 'colon', 'prime', 'dots',
  'vdots', 'ddots', 'le', 'ge', 'ne', 'lvert', 'rvert',
];

const sortedCommands = [...new Set(latexCommands)].sort((a, b) => b.length - a.length);

console.log('=== LaTeX JSON v3 修复 ===');
console.log('原始文件大小:', raw.length, '字节');

const fixLog = [];
let totalFixes = 0;

// Step 1: Handle corrupted control characters first
// For commands starting with t (tab), f (form feed), b (backspace), n (newline), r (CR)
// These JSON escapes have corrupted LaTeX command prefixes
const controlMap = {
  t: { char: '\t', name: 'tab' },
  f: { char: '\f', name: 'form_feed' },
  b: { char: '\b', name: 'backspace' },
  n: { char: '\n', name: 'newline' },
  r: { char: '\r', name: 'carriage_return' },
};

for (const cmd of sortedCommands) {
  const firstChar = cmd[0];
  if (controlMap[firstChar]) {
    const ctrlChar = controlMap[firstChar].char;
    // Match: control char + rest of command (without the first letter)
    // E.g., for "times": match TAB + "imes"
    // For "frac": match FORM_FEED + "rac"
    const restOfCmd = cmd.substring(1);
    // Build regex: control char + rest of cmd, followed by non-letter or end
    // The control char needs to be matched literally in the regex
    const escapedRest = restOfCmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${ctrlChar}${escapedRest}(?![a-zA-Z])`, 'g');
    
    let match;
    while ((match = re.exec(raw)) !== null) {
      totalFixes++;
      const pos = match.index;
      fixLog.push({
        type: 'control_char_fix',
        cmd,
        pos,
        context: raw.substring(Math.max(0, pos - 15), pos + match[0].length + 15),
      });
      // Replace: control char + rest → \\cmd (in raw text: backslash + cmd)
      raw = raw.substring(0, pos) + '\\' + cmd + raw.substring(pos + match[0].length);
    }
  }
}

console.log(`Step 1 (control char fix): found ${fixLog.length} corrupted LaTeX commands`);

// Step 2: Handle single-backslash LaTeX commands
for (const cmd of sortedCommands) {
  // Match: \cmd not preceded by \, and followed by something that's NOT a letter
  // (to avoid matching \textbf inside a longer command)
  const re = new RegExp(`(?<!\\\\)\\\\${cmd}(?![a-zA-Z])`, 'g');
  
  let match;
  while ((match = re.exec(raw)) !== null) {
    totalFixes++;
    const pos = match.index;
    fixLog.push({
      type: 'single_bs_fix',
      cmd,
      pos,
      context: raw.substring(Math.max(0, pos - 15), pos + match[0].length + 15),
    });
    // Replace: \cmd → \\cmd (escape the backslash in the raw text)
    raw = raw.substring(0, pos) + '\\\\' + cmd + raw.substring(pos + match[0].length);
  }
}

console.log(`Step 2 (single backslash fix): total fixes now ${totalFixes}`);
console.log(`Total fixes: ${totalFixes}`);

if (fixLog.length > 0) {
  console.log('\nFix details (first 40):');
  for (let i = 0; i < Math.min(40, fixLog.length); i++) {
    const f = fixLog[i];
    console.log(`  ${i + 1}. [${f.type}] \\${f.cmd} @ pos ${f.pos}: ...${f.context}...`);
  }
  if (fixLog.length > 40) {
    console.log(`  ... and ${fixLog.length - 40} more`);
  }
}

// Step 3: Verify JSON parses correctly
console.log('\n=== Verification ===');
try {
  const questions = JSON.parse(raw);
  console.log(`JSON 解析成功，共 ${questions.length} 道题`);

  // Check for remaining issues
  let remainingIssues = 0;
  for (const q of questions) {
    const fieldsToCheck = [
      { name: 'stem', val: q.stem },
      { name: 'solution', val: q.solution },
      { name: 'variant_stem', val: q.variant_stem },
      { name: 'variant_answer', val: q.variant_answer },
      { name: 'answer', val: q.answer },
    ];
    for (const opt of (q.options || [])) {
      fieldsToCheck.push({ name: `option[${opt.key}].text`, val: opt.text });
    }

    for (const { name, val } of fieldsToCheck) {
      if (!val) continue;
      // Check for control chars (tab, form feed, backspace, newline)
      if (/[\t\f\b\n\r]/.test(val)) {
        console.log(`  REMAINING ISSUE in ${name}: control char found in "${val.substring(0, 80)}"`);
        remainingIssues++;
      }
    }
  }

  if (remainingIssues === 0) {
    console.log('  ✅ 无残留控制字符！');
  } else {
    console.log(`  ⚠️ 仍有 ${remainingIssues} 处控制字符问题`);
  }

  // Verify specific questions
  const q1 = questions.find((q) => q.seq_no === 1);
  if (q1) {
    console.log(`  Q1 stem has \\times: ${q1.stem.includes('\\times')}`);
  }

  const qNeg = questions.find((q) => q.stem?.includes('(-3)') && q.stem?.includes('\\times'));
  if (qNeg) {
    console.log(`  (-3)times question has \\times: true`);
  } else {
    const qNeg2 = questions.find((q) => q.stem?.includes('(-3)') && q.stem?.includes('imes'));
    if (qNeg2) {
      console.log(`  ⚠️ (-3)times question still broken: "${qNeg2.stem?.substring(0, 60)}"`);
    }
  }

  // Check frac
  const qFrac = questions.find((q) => q.stem?.includes('\\frac'));
  if (qFrac) {
    console.log(`  \\frac check: OK`);
  }

  fs.writeFileSync(filePath, JSON.stringify(questions, null, 2) + '\n', 'utf-8');
  console.log('\n=== 修复完成 ===');
  console.log(`文件已保存: ${filePath}`);
  console.log(`新文件大小: ${fs.statSync(filePath).size} 字节`);
} catch (e) {
  console.error('JSON 解析失败:', e.message);
  const backupPath = filePath + '.broken';
  fs.writeFileSync(backupPath, raw, 'utf-8');
  console.error(`已保存当前文本到: ${backupPath}`);
}