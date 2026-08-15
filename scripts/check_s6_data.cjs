/**
 * check_s6_data.cjs
 * 检查S6题库在数据库中的实际存储数据
 * 诊断LaTeX乱码问题
 */
const fs = require('fs');
const path = require('path');

// 手动加载.env
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

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 环境变量缺失');
  process.exit(1);
}

async function checkData() {
  // 从数据库获取S6题库的题目
  const url = `${SUPABASE_URL}/rest/v1/questions?sku_code=eq.S6-01&day_tag=eq.1&limit=5&order=seq_no.asc`;
  
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
  
  console.log(`\n📊 数据库中S6 Day1题目数量: ${data.length}`);
  
  if (data.length > 0) {
    // 检查第1题的stem字段
    const q = data[0];
    console.log('\n📝 第1题 stem 字段分析:');
    console.log(`  原始值: ${q.stem}`);
    console.log(`  长度: ${q.stem.length}`);
    
    // 检查反斜杠
    const backslashCount = (q.stem.match(/\\/g) || []).length;
    console.log(`  反斜杠数量: ${backslashCount}`);
    
    // 检查常见的LaTeX命令
    const commands = ['\\triangle', '\\angle', '\\leq', '\\odot', '\\frac', '\\sqrt', '\\times'];
    for (const cmd of commands) {
      if (q.stem.includes(cmd)) {
        console.log(`  ✅ 找到命令: ${cmd}`);
      } else if (q.stem.includes(cmd.replace('\\', ''))) {
        console.log(`  ⚠️  找到无反斜杠版本: ${cmd.replace('\\', '')}`);
      }
    }
    
    // 显示更多题目的stem分析
    console.log('\n📚 所有题目的stem摘要:');
    for (const item of data) {
      const stemPreview = item.stem.substring(0, 80);
      console.log(`  D${item.dayTag}-Seq${item.seqNo}: ${stemPreview}...`);
    }
  }
}

checkData().catch(console.error);
