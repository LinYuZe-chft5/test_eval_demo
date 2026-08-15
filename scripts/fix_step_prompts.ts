/**
 * scripts/fix_step_prompts.ts
 * 修复分步题(step)的prompt设计
 * 
 * 问题：原prompt直接给出答案/证明过程，不符合教学逻辑
 * 解决方案：将prompt改为引导性问题
 * 
 * 运行：npx tsx scripts/fix_step_prompts.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(__dirname, 'data');

/**
 * 将直接陈述的prompt转换为引导性问题
 */
function convertPromptToQuestion(prompt: string, stepSeq: number, totalSteps: number): string {
  if (!prompt) return `第${stepSeq}步：`;
  
  // 如果prompt已经是问题形式，保持不变
  if (/[？?]$/.test(prompt.trim())) {
    return prompt;
  }
  
  // 常见模式转换
  const converted = prompt
    // 1. "由XX得XX" → "由XX，可以得到什么？"
    .replace(/^由(.+?)得(.+?)$/, '由$1，可以得到什么？请写出推导过程：')
    // 2. "由XX推出XX" → "由XX可以推出什么？"
    .replace(/^由(.+?)推出(.+?)$/, '由$1可以推出什么？请写出推理依据：')
    // 3. "过点XX作XX" → "请过点XX作辅助线XX"
    .replace(/^过点(.+?)作(.+?)$/, '请过点$1作辅助线$2，并说明这样作的目的：')
    // 4. "连接XX" → "请连接XX"
    .replace(/^连接(.+?)$/, '请连接$1，并说明这样作的目的：')
    // 5. "在XX中，XX" → "在XX中，请利用XX性质/定理"
    .replace(/^在(.+?)中[，,](.+?)$/, '在$1中，请利用$2的相关性质/定理：')
    // 6. "计算XX" → "请计算XX"
    .replace(/^计算(.+?)$/, '请计算$1，并写出计算过程：')
    // 7. "化简XX" → "请化简XX"
    .replace(/^化简(.+?)$/, '请化简$1，并写出化简过程：')
    // 8. "解方程XX" → "请解方程XX"
    .replace(/^解(?:方程|不等式)(.+?)$/, '请解$1，并写出解题过程：')
    // 9. 以"因/因为"开头
    .replace(/^(因|因为)(.+?)$/, '因$1，由此可以得出什么结论？')
    // 10. 以"所以/∴"开头
    .replace(/^(所以|∴)(.+?)$/, '所以$1，请说明推理依据：')
    // 11. "答：XX" → "答案是XX"
    .replace(/^答[：:](.+?)$/, '答案是$1，请验证这个结果：')
    // 12. 通用转换：在陈述句前加提示
    .replace(/^(.+)$/, '请完成以下步骤：$1');
  
  return converted !== prompt ? converted : prompt;
}

/**
 * 处理分步题
 */
function fixStepQuestions(questions: any[]): { fixed: number; total: number } {
  let fixed = 0;
  const stepQuestions = questions.filter(q => q.q_type === 'step' && Array.isArray(q.steps));
  
  for (const q of stepQuestions) {
    const totalSteps = q.steps.length;
    for (let i = 0; i < q.steps.length; i++) {
      const step = q.steps[i];
      if (step.prompt) {
        const originalPrompt = step.prompt;
        step.prompt = convertPromptToQuestion(step.prompt, i + 1, totalSteps);
        if (step.prompt !== originalPrompt) {
          fixed++;
        }
      }
      // 清空answer字段（这是学生要填写的答案，不是预设答案）
      if (step.answer && step.answer.trim()) {
        // 保留answer作为参考答案，但标记它
        step.reference_answer = step.answer;
        step.answer = ''; // 清空，让学生自己填写
      }
    }
  }
  
  return { fixed, total: stepQuestions.length };
}

// 处理所有文件
console.log('========================================');
console.log('分步题Prompt修复工具');
console.log('========================================\n');

const files = ['s3_seed.json', 's6_seed.json', 'questions_seed.json'];
let totalFixed = 0;
let totalStepQuestions = 0;

for (const fileName of files) {
  const filePath = join(DATA_DIR, fileName);
  
  try {
    const raw = readFileSync(filePath, 'utf8');
    const questions: any[] = JSON.parse(raw);
    
    const { fixed, total } = fixStepQuestions(questions);
    totalFixed += fixed;
    totalStepQuestions += total;
    
    writeFileSync(filePath, JSON.stringify(questions, null, 2), 'utf8');
    console.log(`📖 ${fileName}: 修复 ${fixed} / ${total} 道分步题`);
  } catch (err) {
    console.error(`❌ ${fileName} 处理失败:`, err instanceof Error ? err.message : err);
  }
}

console.log('\n========================================');
console.log(`✅ 完成！共修复 ${totalFixed} 处prompt，涉及 ${totalStepQuestions} 道分步题`);
console.log('========================================');
console.log('\n请重新运行种子导入：');
console.log('  npm run seed:s3_s6');
