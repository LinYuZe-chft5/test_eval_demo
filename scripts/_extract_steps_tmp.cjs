const fs = require('fs');
const path = require('path');

function extractSteps(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const stepQs = data.filter(q => q.q_type === 'step');
  console.log(`\n========== ${path.basename(filePath)} 分步题 (共${stepQs.length}道) ==========`);
  stepQs.forEach((q, i) => {
    console.log(`\n--- 第${i+1}题 Day${q.day_tag} Q${q.seq_no} [${q.kp_code}] ---`);
    console.log(`STEM: ${q.stem.replace(/\n/g, ' / ')}`);
    console.log(`STEPS:`);
    (q.steps || []).forEach(s => {
      console.log(`  (${s.seq}) PROMPT: ${s.prompt}`);
      console.log(`       ANSWER: ${s.answer || '(空)'}`);
    });
  });
}

extractSteps(path.join(__dirname, 'data', 's3_seed.json'));
extractSteps(path.join(__dirname, 'data', 's6_seed.json'));
extractSteps(path.join(__dirname, 'data', 'questions_seed.json'));
