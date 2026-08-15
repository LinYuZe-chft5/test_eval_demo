/**
 * check_all_latex.cjs
 * 检查所有题库中包含LaTeX命令的题目
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
  }
}

loadEnvFile();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkAllData() {
  // 检查所有S6题目
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
  
  console.log(`\n📊 S6题库总题目数: ${data.length}`);
  
  // 检查包含LaTeX命令的题目
  const latexCommands = ['triangle', 'angle', 'leq', 'geq', 'odot', 'parallel', 'perp'];
  const problems = [];
  
  for (const q of data) {
    const stem = q.stem || '';
    
    // 检查stem中是否有问题的LaTeX命令
    for (const cmd of latexCommands) {
      // 检查是否有反斜杠
      const withSlash = `\\${cmd}`;
      const withoutSlash = cmd;
      
      if (stem.includes(withSlash)) {
        // 有反斜杠，检查是否完整
        console.log(`  ✅ D${q.dayTag}-Seq${q.seqNo}: 找到 ${withSlash}`);
      } else if (stem.includes(withoutSlash) && !stem.includes(`\\${cmd}`)) {
        // 没有反斜杠
        console.log(`  ⚠️  D${q.dayTag}-Seq${q.seqNo}: 缺少反斜杠 - 包含 "${cmd}" 但没有 "${withSlash}"`);
        problems.push({ day: q.dayTag, seq: q.seqNo, stem, cmd });
      }
    }
  }
  
  if (problems.length > 0) {
    console.log(`\n⚠️  发现 ${problems.length} 道题有LaTeX问题:`);
    for (const p of problems.slice(0, 5)) {
      console.log(`  D${p.day}-Seq${p.seq}: ${p.stem.substring(0, 100)}...`);
    }
  }
  
  // 同样检查选项中的LaTeX
  console.log('\n🔍 检查选项中的LaTeX...');
  let optionProblems = 0;
  for (const q of data) {
    const options = q.options;
    if (Array.isArray(options)) {
      for (const opt of options) {
        if (opt && opt.text) {
          for (const cmd of latexCommands) {
            if (opt.text.includes(cmd) && !opt.text.includes(`\\${cmd}`)) {
              optionProblems++;
              if (optionProblems <= 3) {
                console.log(`  ⚠️  D${q.dayTag}-Seq${q.seq} 选项${opt.key}: "${opt.text}" 缺少反斜杠`);
              }
            }
          }
        }
      }
    }
  }
  
  console.log(`\n📋 选项中共有 ${optionProblems} 处LaTeX问题`);
  
  // 检查本地种子数据
  console.log('\n🔍 检查本地S6种子数据...');
  const seedPath = path.resolve(process.cwd(), 'scripts/data/s6_seed.json');
  const seedContent = fs.readFileSync(seedPath, 'utf8');
  const seedData = JSON.parse(seedContent);
  
  console.log(`  种子数据题目数: ${seedData.length}`);
  
  let seedProblems = 0;
  for (const q of seedData) {
    const stem = q.stem || '';
    for (const cmd of latexCommands) {
      // 种子数据中应该有双反斜杠（JSON转义）
      const jsonEscaped = `\\\\${cmd}`; // JSON文件中的形式: \\triangle
      const withSlash = `\\${cmd}`; // 解析后的形式: \triangle
      
      if (stem.includes(withSlash)) {
        // 种子数据中有单反斜杠（可能是原始数据格式）
        console.log(`  ℹ️  种子 D${q.day_tag}-Seq${q.seq_no}: 包含 "${withSlash}"`);
      }
    }
  }
}

checkAllData().catch(console.error);
