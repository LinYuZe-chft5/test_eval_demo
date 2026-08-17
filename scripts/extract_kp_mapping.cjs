/**
 * 从三个题库种子文件中提取所有KP代码到中文名称的映射
 * 输出 TypeScript 对象格式，可直接粘贴到 report/page.tsx 的 KP_NAME_MAP
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, 'data');

function extractKpMapping(jsonFile) {
  const filePath = path.join(DATA_DIR, jsonFile);
  if (!fs.existsSync(filePath)) {
    console.log(`文件不存在: ${filePath}`);
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  const questions = Array.isArray(data) ? data : [];

  const kpMap = {};  // { kp_code: kp_name }

  for (const q of questions) {
    // 方式1: 从 knowledge_points.primary 提取
    if (q.knowledge_points && q.knowledge_points.primary) {
      const primary = q.knowledge_points.primary;
      if (primary.code && primary.name && !primary.code.startsWith('KP-') === false) {
        // 跳过 name 是代码本身的情况（数据中可能有错误）
        if (!primary.name.startsWith('KP-')) {
          kpMap[primary.code] = primary.name;
        }
      }
    }

    // 方式2: 从 knowledge_points.secondary 提取（如果有的话）
    if (q.knowledge_points && q.knowledge_points.secondary) {
      const secondary = q.knowledge_points.secondary;
      if (secondary.code && secondary.name && !secondary.name.startsWith('KP-')) {
        kpMap[secondary.code] = secondary.name;
      }
    }

    // 方式3: 直接从 kp_code 字段和 improve_tip 猜测（兜底）
    // 这个方式不可靠，跳过
  }

  console.log(`  ${jsonFile}: 提取到 ${Object.keys(kpMap).length} 个知识点`);
  return kpMap;
}

console.log('正在从题库种子文件提取知识点映射...\n');

const s1Map = extractKpMapping('questions_seed.json');  // 初一
const s3Map = extractKpMapping('s3_seed.json');        // 初二
const s6Map = extractKpMapping('s6_seed.json');        // 初三

// 合并三个映射（后面的覆盖前面的）
const mergedMap = { ...s1Map, ...s3Map, ...s6Map };

console.log(`\n合并后共 ${Object.keys(mergedMap).length} 个知识点\n`);

// 按 KP 代码排序输出
const sortedKeys = Object.keys(mergedMap).sort();

// 生成 TypeScript 代码
let output = '// 知识点中文名称映射（从题库种子文件自动提取）\n';
output += 'const KP_NAME_MAP: Record<string, string> = {\n';

for (const k of sortedKeys) {
  const name = mergedMap[k];
  // 转义单引号
  const escapedName = name.replace(/'/g, "\\'");
  output += `  '${k}': '${escapedName}',\n`;
}

// 添加兜底映射（根据已知映射补充）
output += `  // ===== 兜底映射（无法从题库提取，手动补充） =====\n`;
output += `  'KP-01.01': '正负数概念',\n`;
output += `  'KP-01.02': '有理数基础',\n`;
output += `  'KP-03.01': '代数式与整式概念',\n`;
output += `  'KP-03.02': '代入求值与整式运算',\n`;
output += `  'KP-04.01': '一元一次方程',\n`;
output += `  'KP-04.02': '一元一次不等式',\n`;
output += `  'KP-04.03': '含参方程与不等式',\n`;
output += `  'KP-06.01': '二元一次方程组概念',\n`;
output += `  'KP-06.02': '代入消元法',\n`;
output += `  'KP-06.03': '加减消元法',\n`;
output += `  'KP-06.04': '方程组应用题',\n`;
output += `  'KP-06.05': '方程组整数解',\n`;
output += `  'KP-07.01': '相交线与对顶角',\n`;
output += `  'KP-07.02': '平行线判定',\n`;
output += `  'KP-07.03': '平行线性质',\n`;
output += `  'KP-07.04': '平移变换',\n`;
output += `  'KP-07.05': '角平分线',\n`;
output += `  'KP-07.06': '拐点问题',\n`;
output += `  'KP-07.07': '辅助线构造',\n`;
output += `  'KP-08.01': '幂的运算',\n`;
output += `  'KP-08.02': '积的乘方与幂的乘方',\n`;
output += `  'KP-08.03': '乘法公式',\n`;
output += `  'KP-08.04': '整式混合运算',\n`;
output += `  'KP-09.01': '因式分解概念',\n`;
output += `  'KP-09.02': '提公因式法',\n`;
output += `  'KP-09.03': '公式法分解',\n`;
output += `  'KP-09.04': '综合因式分解',\n`;
output += `  'KP-09.05': '因式分解应用',\n`;
output += `  'KP-09.06': '十字相乘法',\n`;
output += `  'KP-10.01': '三角形三边关系',\n`;
output += `  'KP-10.02': '三角形中线与角平分线',\n`;
output += `  'KP-10.03': '平行线分三角形成比例',\n`;
output += `  'KP-10.04': '三角形内角和',\n`;
output += `  'KP-10.05': '三角形综合应用',\n`;
output += `  'KP-11.01': '不等式性质',\n`;
output += `  'KP-11.02': '不等式解法',\n`;
output += `  'KP-11.03': '不等式组解法',\n`;
output += `  'KP-11.04': '不等式(组)应用',\n`;
output += `  'KP-12.01': '分式有意义条件',\n`;
output += `  'KP-12.02': '分式加减运算',\n`;
output += `  'KP-12.03': '分式乘除运算',\n`;
output += `  'KP-12.04': '分式方程',\n`;
output += `  'KP-13.01': '全等三角形概念',\n`;
output += `  'KP-13.02': '全等三角形判定',\n`;
output += `  'KP-13.03': '全等三角形性质',\n`;
output += `  'KP-13.04': '全等三角形综合应用',\n`;
output += `  // ===== 初三知识点 =====\n`;
output += `  'KP-23.01': '一元二次方程解法',\n`;
output += `  'KP-23.02': '一元二次方程应用',\n`;
output += `  'KP-24.01': '二次函数概念与图象',\n`;
output += `  'KP-24.02': '二次函数性质与应用',\n`;
output += `  'KP-25.01': '旋转与中心对称',\n`;
output += `  'KP-25.02': '圆的基本性质',\n`;
output += `  'KP-28.01': '概率初步',\n`;
output += `  'KP-28.02': '用列举法求概率',\n`;
output += `  'KP-29.01': '相似三角形判定',\n`;
output += `  'KP-29.02': '相似三角形性质与应用',\n`;
output += `  'KP-30.01': '锐角三角函数',\n`;
output += `  'KP-31.01': '投影与视图',\n`;
output += `  'KP-31.02': '投影与视图应用',\n`;
output += `  // ===== 小升初衔接知识点 =====\n`;
output += `  'KP-P.1': '分数基本性质',\n`;
output += `  'KP-P.2': '小数与分数互化',\n`;
output += `  'KP-P.3': '钟表角度计算',\n`;
output += `  'KP-P.4': '四则混合运算',\n`;
output += `  'KP-P.5': '比例与比例尺',\n`;
output += `  'KP-P.6': '正比例函数',\n`;
output += `  'KP-P.7': '反比例函数',\n`;
output += `};\n`;

const outputFile = path.resolve(__dirname, 'kp_name_map_output.ts');
fs.writeFileSync(outputFile, output, 'utf8');

console.log(`输出文件已生成: ${outputFile}`);
console.log('请将文件内容复制粘贴到 report/page.tsx 的 KP_NAME_MAP 定义处');
