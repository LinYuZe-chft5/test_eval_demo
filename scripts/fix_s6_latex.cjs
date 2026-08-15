/**
 * fix_s6_latex.cjs
 * 修复S6题库中缺少反斜杠的LaTeX命令
 */
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) continue;
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex === -1) continue;
      const key = trimmedLine.substring(0, equalIndex).trim();
      let value = trimmedLine.substring(equalIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    console.log('✅ 已加载 .env 文件');
  }
}

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fixS6Latex() {
  // 获取所有S6题目
  const url = `${SUPABASE_URL}/rest/v1/questions?sku_code=eq.S6-01&limit=100&order=day_tag.asc,seq_no.asc`;
  
  const response = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  
  if (!response.ok) {
    console.error('❌ API请求失败:', response.status);
    return;
  }
  
  const data = await response.json();
  console.log(`📊 获取到 ${data.length} 道题`);
  
  // 修复函数：为缺少反斜杠的LaTeX命令添加反斜杠
  function fixMissingBackslashes(text) {
    if (!text) return text;
    let result = text;
    
    // 需要检查的LaTeX命令
    const commands = ['triangle', 'angle', 'leq', 'geq', 'neq', 'sim', 'approx', 
                      'parallel', 'perp', 'odot', 'frac', 'sqrt', 'times', 'div',
                      'pm', 'cdot', 'sin', 'cos', 'tan', 'log', 'ln',
                      'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi'];
    
    // 为每个命令添加反斜杠（如果缺少）
    for (const cmd of commands) {
      // 匹配 $ 后面直接跟命令但没有反斜杠的情况
      // 例如: $angle → $\angle
      const regex = new RegExp(`\\$${cmd}(?=[{[\\s0-9,.;!?]|$)`, 'g');
      result = result.replace(regex, `$\\${cmd}`);
      
      // 匹配 ^ 后面直接跟命令但没有反斜杠的情况
      const regex2 = new RegExp(`\\^${cmd}(?=[{[\\s0-9]|$)`, 'g');
      result = result.replace(regex2, `^\\${cmd}`);
      
      // 匹配 _ 后面直接跟命令但没有反斜杠的情况
      const regex3 = new RegExp(`_${cmd}(?=[{[\\s0-9]|$)`, 'g');
      result = result.replace(regex3, `_\\${cmd}`);
    }
    
    return result;
  }
  
  let fixedCount = 0;
  
  for (const q of data) {
    let needsUpdate = false;
    const updates = {};
    
    // 检查stem字段
    if (q.stem) {
      const fixedStem = fixMissingBackslashes(q.stem);
      if (fixedStem !== q.stem) {
        updates.stem = fixedStem;
        needsUpdate = true;
        console.log(`  🔧 修复 D${q.dayTag}-Seq${q.seqNo} stem`);
        console.log(`    原: ${q.stem.substring(0, 100)}`);
        console.log(`    新: ${fixedStem.substring(0, 100)}`);
      }
    }
    
    // 检查options字段
    if (q.options && Array.isArray(q.options)) {
      let optionsFixed = false;
      const newOptions = q.options.map(opt => {
        if (opt.text) {
          const fixedText = fixMissingBackslashes(opt.text);
          if (fixedText !== opt.text) {
            optionsFixed = true;
            return { ...opt, text: fixedText };
          }
        }
        return opt;
      });
      if (optionsFixed) {
        updates.options = newOptions;
        needsUpdate = true;
        console.log(`  🔧 修复 D${q.dayTag}-Seq${q.seqNo} options`);
      }
    }
    
    // 检查steps字段
    if (q.steps && Array.isArray(q.steps)) {
      let stepsFixed = false;
      const newSteps = q.steps.map(step => {
        if (step.prompt) {
          const fixedPrompt = fixMissingBackslashes(step.prompt);
          if (fixedPrompt !== step.prompt) {
            stepsFixed = true;
            return { ...step, prompt: fixedPrompt };
          }
        }
        return step;
      });
      if (stepsFixed) {
        updates.steps = newSteps;
        needsUpdate = true;
        console.log(`  🔧 修复 D${q.dayTag}-Seq${q.seqNo} steps`);
      }
    }
    
    // 更新数据库
    if (needsUpdate) {
      const updateUrl = `${SUPABASE_URL}/rest/v1/questions?sku_code=eq.${q.skuCode}&day_tag=eq.${q.dayTag}&seq_no=eq.${q.seqNo}`;
      
      const updateResponse = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(updates),
      });
      
      if (updateResponse.ok) {
        fixedCount++;
        console.log(`  ✅ D${q.dayTag}-Seq${q.seqNo} 更新成功`);
      } else {
        console.error(`  ❌ D${q.dayTag}-Seq${q.seqNo} 更新失败:`, await updateResponse.text());
      }
    }
  }
  
  console.log(`\n🎉 修复完成！共修复 ${fixedCount} 道题`);
}

fixS6Latex().catch(console.error);
