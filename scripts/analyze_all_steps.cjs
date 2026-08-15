/**
 * analyze_all_steps.cjs
 * 分析所有S1/S3/S6的分步题，对比prompt设计
 */
const fs = require('fs');
const path = require('path');

function analyzeFile(filePath, label) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  
  const stepQuestions = data.filter(q => q.q_type === 'step' && Array.isArray(q.steps) && q.steps.length > 0);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 ${label} - 分步题总数: ${stepQuestions.length}`);
  console.log('='.repeat(60));
  
  for (const q of stepQuestions) {
    console.log(`\n📝 D${q.day_tag}-Seq${q.seq_no} (${q.kp_code})`);
    console.log(`  题干: ${q.stem.substring(0, 100)}${q.stem.length > 100 ? '...' : ''}`);
    
    for (const step of q.steps) {
      const isQuestion = /第.*步|请|写出|求|计算|说明|证明|添加|推导|推理|过程|方程|化简|代入|去分母|去括号|合并|配方|因式|展开|结果/.test(step.prompt);
      const marker = isQuestion ? '✅' : '❌';
      console.log(`  ${marker} Step ${step.seq}: "${step.prompt.substring(0, 80)}${step.prompt.length > 80 ? '...' : ''}"`);
    }
  }
  
  return stepQuestions.length;
}

const baseDir = path.resolve(process.cwd(), 'scripts/data');
analyzeFile(path.join(baseDir, 'questions_seed.json'), 'S1 (初一)');
analyzeFile(path.join(baseDir, 's3_seed.json'), 'S3 (初二)');
analyzeFile(path.join(baseDir, 's6_seed.json'), 'S6 (初三)');
