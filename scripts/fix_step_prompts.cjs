/**
 * scripts/fix_step_prompts.cjs
 * 修复分步题(step)的prompt设计，将直接给出答案的prompt改为引导式问题
 * 
 * 问题：当前分步题的prompt如"过点E作 EF\parallel AB"、"得 \angle BED=70°"
 *       直接展示了完整解题过程，学生只需抄录即可，无法真实评估解题能力
 * 
 * 解决方案：将prompt改为引导式问题，让学生需要思考后作答
 */

const fs = require('fs');
const path = require('path');

// 分步题prompt转换规则
const STEP_PROMPT_RULES = [
  // Day2 Seq14: 平行线拐点证明题
  {
    match: /过点E作.*EF.*AB/,
    prompts: [
      { seq: 1, prompt: '请添加一条辅助线，使 $AB\\parallel CD$ 的性质能够应用于求解 $\\angle BED$（写出辅助线的作法）' },
      { seq: 2, prompt: '利用 $AB\\parallel CD$ 和你添加的辅助线，分别求出 $\\angle BEF$ 和 $\\angle FED$ 的度数，并说明依据' },
      { seq: 3, prompt: '根据以上推理，计算 $\\angle BED$ 的度数' },
    ]
  },
  // Day2 Seq15: 平行线+角平分线综合题
  {
    match: /由.*DE.*BC.*得.*ADE.*C/,
    prompts: [
      { seq: 1, prompt: '已知 $DE\\parallel BC$，请直接写出 $\\angle ADE$ 与 $\\angle C$ 的数量关系及依据' },
      { seq: 2, prompt: '根据已知条件 $\\angle ADE=70^{\\circ}$ 和你的推理，得出 $\\angle C$ 的值' },
    ]
  },
];

// Day3中的分步题也需要检查
const DAY3_STEP_RULES = [
  // Day3 Seq8: 全等三角形证明题
  {
    match: /在.*ABD.*和.*ACE.*中/,
    prompts: [
      { seq: 1, prompt: '由 $\\angle BAC=\\angle DAE$，两边同时减去 $\\angle DAC$ 后，能得到什么新的等量关系？请写出推理过程' },
      { seq: 2, prompt: '在 $\\triangle ABD$ 和 $\\triangle ACE$ 中，写出你已推导出的三组对应相等的元素' },
      { seq: 3, prompt: '根据以上三组对应相等的元素，判断 $\\triangle ABD\\cong\\triangle ACE$ 的判定依据，并写出结论' },
    ]
  },
  // Day3 Seq9: 四边形证明题
  {
    match: /连接.*AC|四边形.*ABCD/,
    prompts: [
      { seq: 1, prompt: '请添加辅助线 $AC$，并写出在 $\\triangle ABC$ 和 $\\triangle ADC$ 中你能得到的相等元素' },
      { seq: 2, prompt: '利用你得到的相等元素，证明 $\\triangle ABC\\cong\\triangle ADC$，并写出判定依据' },
      { seq: 3, prompt: '由 $\\triangle ABC\\cong\\triangle ADC$ 能推出 $AB=AD$ 吗？请说明理由' },
    ]
  },
];

/**
 * 修复单个题目的steps
 */
function fixSteps(steps, dayTag, seqNo) {
  if (!Array.isArray(steps) || steps.length === 0) return steps;

  const rules = dayTag === 3 ? DAY3_STEP_RULES : STEP_PROMPT_RULES;

  // 尝试匹配规则
  for (const rule of rules) {
    if (rule.prompts.length > 0) {
      // 检查现有prompt是否已经是引导式（不包含直接答案）
      const currentPrompts = steps.map(s => s.prompt || '').join(' ');
      
      // 如果prompt包含明显的答案模式，则需要修改
      const hasAnswerPattern = /得.*=\d+|答.*=\d+|即.*=\d+/.test(currentPrompts);
      
      if (hasAnswerPattern || rule.prompts.some((p, i) => 
        steps[i] && steps[i].prompt && rule.match.test(steps[i].prompt))) {
        // 应用新的prompt
        const newSteps = steps.map((step, idx) => {
          const newPrompt = rule.prompts[idx];
          if (newPrompt) {
            return {
              ...step,
              prompt: newPrompt.prompt || newPrompt
            };
          }
          return step;
        });
        return newSteps;
      }
    }
  }

  // 通用修复：将直接陈述改为引导式
  const GENERIC_FIXES = [
    // "由X得Y" -> "利用X，写出Y的推导过程"
    {
      pattern: /由(.+?)得(.+)/,
      transform: (match, p1, p2) => `利用${p1}，推导${p2}`
    },
    // "答X" -> "根据以上推理，得出X"
    {
      pattern: /答\s*(.+)/,
      transform: (match, p1) => `根据以上推理，得出${p1}`
    },
    // "即X" -> "计算X"
    {
      pattern: /即(.+)/,
      transform: (match, p1) => `计算${p1}`
    },
  ];

  return steps.map(step => {
    let prompt = step.prompt || '';
    
    // 检查是否包含直接答案
    if (/^[得答即\s].*=\d+/.test(prompt.trim())) {
      // 这是直接给出答案的prompt，需要改为引导式
      prompt = prompt.replace(/^得\s*/, '请推导：');
      prompt = prompt.replace(/^答\s*/, '请计算：');
      prompt = prompt.replace(/^即\s*/, '请证明：');
    }
    
    // 应用通用修复规则
    for (const fix of GENERIC_FIXES) {
      if (fix.pattern.test(prompt)) {
        prompt = prompt.replace(fix.pattern, fix.transform);
      }
    }
    
    return {
      ...step,
      prompt: prompt
    };
  });
}

/**
 * 处理单个种子数据文件
 */
function processSeedFile(filePath) {
  console.log(`\n处理文件: ${filePath}`);
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let fixCount = 0;
  
  const fixedData = data.map((item, idx) => {
    if (item.q_type === 'step' && item.steps && Array.isArray(item.steps)) {
      const dayTag = item.day_tag || 1;
      const seqNo = item.seq_no || 0;
      const originalPrompts = item.steps.map(s => s.prompt).join(' | ');
      
      const fixedSteps = fixSteps(item.steps, dayTag, seqNo);
      const newPrompts = fixedSteps.map(s => s.prompt).join(' | ');
      
      if (originalPrompts !== newPrompts) {
        console.log(`  修复题目 Day${dayTag} Seq${seqNo}:`);
        console.log(`    原: ${originalPrompts.substring(0, 80)}...`);
        console.log(`    新: ${newPrompts.substring(0, 80)}...`);
        fixCount++;
      }
      
      return {
        ...item,
        steps: fixedSteps
      };
    }
    return item;
  });
  
  if (fixCount > 0) {
    fs.writeFileSync(filePath, JSON.stringify(fixedData, null, 2), 'utf-8');
    console.log(`\n共修复 ${fixCount} 道分步题`);
  } else {
    console.log('\n没有需要修复的分步题');
  }
  
  return fixCount;
}

// 主程序
function main() {
  const dataDir = path.join(__dirname, 'data');
  
  const files = [
    's3_seed.json',
    's6_seed.json',
    'questions_seed.json'
  ];
  
  let totalFixes = 0;
  
  for (const file of files) {
    const filePath = path.join(dataDir, file);
    if (fs.existsSync(filePath)) {
      const fixes = processSeedFile(filePath);
      totalFixes += fixes;
    } else {
      console.log(`\n文件不存在: ${filePath}`);
    }
  }
  
  console.log(`\n\n总计修复 ${totalFixes} 道分步题`);
  console.log('修复完成！');
}

main();