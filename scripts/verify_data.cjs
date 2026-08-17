#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Manual .env loader
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const eq = t.indexOf('=');
    if (eq < 0) return;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  });
}

const API = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1';
const HEADERS = {
  'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
  'Authorization': 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
};

(async () => {
  console.log('验证 S3-01 题库数据...\n');
  
  for (const day of [1, 2, 3]) {
    const r = await fetch(
      API + '/questions?sku_code=eq.S3-01&day_tag=eq.' + day + '&select=id,q_type,stem,steps&order=seq_no.asc',
      { headers: HEADERS }
    );
    const data = await r.json();
    console.log(`Day ${day}: ${data.length} 题`);
    data.forEach((q, i) => {
      const stepsInfo = q.steps ? `, steps=${q.steps.length}` : '';
      console.log(`  ${i + 1}. [${q.q_type}${stepsInfo}] ${(q.stem || '').slice(0, 60)}`);
    });
  }
  
  // Count step questions with actual steps data
  const all = await fetch(
    API + '/questions?sku_code=eq.S3-01&q_type=eq.step&select=id,stem,steps',
    { headers: HEADERS }
  );
  const stepData = await all.json();
  console.log(`\nStep题型总计: ${stepData.length}`);
  stepData.forEach((q) => {
    console.log(`  - steps字段: ${q.steps ? '存在(' + q.steps.length + '步)' : '为null'}`);
    if (q.steps && q.steps.length > 0) {
      console.log(`    第1步prompt: ${(q.steps[0].prompt || '').slice(0, 50)}`);
    }
  });
})();
