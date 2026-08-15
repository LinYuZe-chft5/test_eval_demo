/**
 * fix_all_steps_v2.cjs
 * 修复S3/S6所有分步题的prompt设计
 * 核心策略：
 * 1. 如果题干中包含明确的(1)(2)(3)小问，直接提取作为各步prompt
 * 2. 否则根据答案和知识点类型，生成对应的引导式问题
 * 3. 参考S1的格式：如"第一步：去括号（写出展开结果）"
 */
const fs = require('fs');
const path = require('path');

function extractSubQuestions(stem) {
  // 匹配 (1) xxx  或 （1）xxx  或 1. xxx 等格式
  const patterns = [
    /（\s*\d+\s*）([^（）]+?)(?=（\s*\d+\s*）|$)/g,
    /\(\s*\d+\s*\)([^\(\)]+?)(?=\(\s*\d+\s*\)|$)/g,
    /^\s*\d+\s*[.、]\s*([^\n]+)/gm,
  ];
  
  for (const pattern of patterns) {
    const matches = [...stem.matchAll(pattern)];
    if (matches.length >= 2) {
      return matches.map(m => (m[1] || m[0]).trim());
    }
  }
  return null;
}

function hasChineseQuestionMark(text) {
  return /求|计算|请写|请画|请添加|求证|证明|说明|得出|求|求.|写出|展开|合并|化简|代入|配方|去|因式|解|整理|判断|比较|选择|估计|预算|确定|证明|推理|推导|比较|列出/.test(text);
}

function generateStepPrompt(stepPrompt, stepAnswer, stepIdx, kpCode, stem) {
  // 如果已经是问题形式（包含明确的引导词），直接返回
  if (hasChineseQuestionMark(stepPrompt)) {
    // 规范化格式：添加"第X步："前缀
    const chineseNums = ['一', '二', '三', '四', '五', '六'];
    const prefix = `第${chineseNums[stepIdx]}步：`;
    if (!stepPrompt.startsWith('第') && !stepPrompt.startsWith('请') && !stepPrompt.startsWith('（') && !stepPrompt.startsWith('(')) {
      return prefix + stepPrompt;
    }
    return stepPrompt;
  }

  // 下面根据KP知识点类型和答案内容，反向生成问题
  const promptNoLaTeX = stepPrompt.replace(/\$[^$]*\$/g, 'FORMULA');
  
  // ============ 知识点类型判断 & 生成对应问题 ============
  
  // 1. 统计类：百分比、条形图、扇形图
  if (/÷|×|百分之|\%/.test(stepPrompt) || kpCode.startsWith('KP-32') || /总人数|估计|占比|百分比/.test(stem)) {
    if (stepIdx === 0) {
      return '（1）求全班总人数';
    } else if (stepIdx === 1) {
      const subQs = extractSubQuestions(stem);
      if (subQs && subQs[1]) return `（2）${subQs[1]}`;
      return '（2）求"≥1小时"的人数';
    } else {
      const subQs = extractSubQuestions(stem);
      if (subQs && subQs[2]) return `（3）${subQs[2]}`;
      return '（3）若全校有1200名学生，估计其中"≥1小时"的学生人数';
    }
  }
  
  // 2. 全等三角形类
  if (kpCode.includes('10.03') || /全等|SAS|ASA|SSS|AAS|≌/.test(stem + stepPrompt)) {
    if (/BAD|CAE|DAC|BAC|等量|角相等/.test(stepPrompt + stepAnswer)) {
      return '由已知角的关系，两边同时减去公共角后，能得到什么新的等量关系？请写出推理过程';
    }
    if (/AB.*AC.*AD.*AE|AB.*=.*AC|条件/.test(stepPrompt + stepAnswer)) {
      return '在两个三角形中，请列出证明全等所需的三个条件（边或角相等的关系）';
    }
    if (/全等|≌|SAS|ASA|SSS|AAS/.test(stepPrompt + stepAnswer)) {
      return '根据以上条件，判定两个三角形全等的依据是什么？请写明理由';
    }
    if (/CE.*BD|CE|BD|边长/.test(stepPrompt + stepAnswer)) {
      return '由全等三角形的性质，求对应边 CE 的长度';
    }
  }
  
  // 3. 圆类：直径、圆周角、CD高、面积法
  if (kpCode.startsWith('KP-28') || /直径|圆周角|CD.*AB|面积法|圆/.test(stem + stepPrompt)) {
    if (/90|ACB|直径|直角/.test(stepPrompt + stepAnswer)) {
      return '由 AB 是直径这一条件，能得到什么特殊角？请写出度数和依据';
    }
    if (/sqrt|AB.*=|勾股|斜边/.test(stepPrompt + stepAnswer)) {
      return '利用勾股定理，求斜边 AB 的长度，写出计算过程';
    }
    if (/1\/2|面积.*AC.*BC|面积法|等式/.test(stepPrompt + stepAnswer)) {
      return '请用两种方式表示△ABC的面积，建立关于CD的等式';
    }
    if (/CD.*=|12\/5|CD/.test(stepPrompt + stepAnswer)) {
      return '根据面积等式，求 CD 的长度（写成分数或小数形式）';
    }
  }
  
  // 4. 平行线+角度类
  if (kpCode.includes('07.06') || /平行|AB.*CD|∠|辅助线|平行/.test(stem + stepPrompt)) {
    if (/辅助线|添加|EF|过点/.test(stepPrompt + stem)) {
      return '请添加一条辅助线，使 AB∥CD 的性质能够应用于求解（写出辅助线的作法）';
    }
    if (/BEF|FED|角度相等|内错角/.test(stepPrompt + stepAnswer)) {
      return '利用平行线和你添加的辅助线，分别求出相关角的度数，并说明每一步的依据';
    }
    if (/BED|最终|相加|结论/.test(stepPrompt + stepAnswer) || /∠BED/.test(stem)) {
      return '根据以上推理，计算所求角度 ∠BED 的度数';
    }
  }
  
  // 5. 相似三角形类
  if (kpCode.startsWith('KP-11') || /相似|相似比|ADE.*ABC|成比例/.test(stem + stepPrompt)) {
    if (stepIdx === 0) {
      return '先判定两三角形是否相似，写出判定的条件和依据';
    } else if (stepIdx === 1) {
      return '根据相似比，写出对应边的比例式';
    } else {
      return '代入已知数值，求解对应边的长度';
    }
  }
  
  // 6. 二次函数/抛物线类
  if (kpCode.startsWith('KP-26') || /抛物线|x轴.*交点|坐标|P.*点|面积为/.test(stem + stepPrompt)) {
    const subQs = extractSubQuestions(stem);
    if (subQs && subQs[stepIdx]) {
      return `（${stepIdx + 1}）${subQs[stepIdx]}`;
    }
    if (/x轴.*交点|A.*B.*点|坐标|根/.test(stepPrompt + stepAnswer + stem)) {
      return '求抛物线与 x 轴交点 A、B 的坐标';
    }
    if (/y轴.*交点|C.*点|0.*,\s*\d/.test(stepPrompt + stepAnswer + stem)) {
      return '求抛物线与 y 轴交点 C 的坐标';
    }
    if (/面积|△ABC/.test(stepPrompt + stepAnswer + stem)) {
      return '根据三点坐标，计算 △ABC 的面积';
    }
    if (/:.*存在|是否存在.*P.*点|几个/.test(stem + stepPrompt)) {
      if (stepIdx === 0) return '（1）求 A、B 两点的坐标及 AB 的长度';
      if (stepIdx === 1) return '（2）根据面积条件，建立关于点 P 纵坐标 |yP| 的方程';
      return '（3）分两种情况讨论，求满足条件的点 P 的个数';
    }
  }
  
  // 7. 切线类
  if (kpCode.startsWith('KP-29') || /切|⊙O.*A|切线|PA.*切/.test(stem + stepPrompt)) {
    if (/∠.*30|OA.*垂直|连半径/.test(stepPrompt + stepAnswer + stem)) {
      return '由切线性质，连接 OA 后能得到什么特殊关系？结合 ∠P 的度数分析';
    }
    if (/OP.*=.*OA|斜边|特殊角/.test(stepPrompt + stepAnswer + stem)) {
      return '在直角三角形中，利用 30° 角所对直角边的性质，求斜边 OP 的长度';
    }
    if (/PB|OB.*半径|减去/.test(stepPrompt + stepAnswer + stem)) {
      return '已知半径 OB，利用 OP-OB 求 PB 的长度';
    }
  }
  
  // 8. 一元二次方程类
  if (kpCode.startsWith('KP-24') || /x.*x|方程|解是|判别式|两根/.test(stem + stepPrompt)) {
    if (/判别式|Δ|不等.*实根|范围|k.*</.test(stepPrompt + stepAnswer + stem)) {
      return '根据"两个不等实根"的条件，建立关于 k 的不等式（用到判别式 Δ>0）';
    }
    if (/x1.*x2|韦达|两根之和|两根之积/.test(stepPrompt + stepAnswer + stem)) {
      return '利用韦达定理，分别写出 x1+x2 和 x1x2 的值，再代入计算';
    }
  }
  
  // 9. 方程组/二元一次类
  if (kpCode.startsWith('KP-06') || /方程组|代入|消元|加减/.test(stem + stepPrompt)) {
    if (/代入|y.*=|用代入/.test(stepPrompt + stepAnswer + stem)) {
      return '第一步：用代入法，将含 x 的表达式代入另一方程（写出变形后的方程）';
    }
    if (/消元|相加|相减|加减/.test(stepPrompt + stepAnswer + stem)) {
      return '第二步：用加减法消去一个未知数，写出消元后得到的方程';
    }
    if (/x.*=|y.*=|结果/.test(stepPrompt + stepAnswer)) {
      return '第三步：求解方程组，写出最后结果';
    }
  }
  
  // 10. BE⊥DE类 垂直证明
  if (kpCode.includes('07.') && /BE.*DE|垂直|平分.*∠/.test(stem + stepPrompt)) {
    if (stepIdx === 0) return '由 AB∥CD，推出同旁内角 ∠ABD + ∠CDB 的关系';
    if (stepIdx === 1) return '由角平分线性质，分别写出 ∠EBD 和 ∠EDB 的表达式';
    return '在 △BED 中，计算 ∠BED 的度数，判断 BE 和 DE 的位置关系';
  }

  // ============ 通用兜底：根据步骤序号生成 ============
  const chineseNums = ['一', '二', '三', '四', '五', '六'];
  
  // 检查题干中是否有(1)(2)(3)形式的小问，优先使用
  const subQs = extractSubQuestions(stem);
  if (subQs && subQs[stepIdx]) {
    // 规范格式
    let q = subQs[stepIdx];
    // 去除结尾多余的标点符号和空格
    q = q.replace(/[；;。,，\s]+$/g, '').trim();
    // 如果已经是中文括号开头，保留；否则加前缀
    if (/^[（(]\d/.test(q)) {
      return q;
    }
    return `（${stepIdx + 1}）${q}`;
  }
  
  // 通用格式
  const genericPrefix = `第${chineseNums[stepIdx]}步：`;
  
  // 检查答案特征
  if (/=/.test(stepAnswer || '') || stepPrompt.includes('=')) {
    return `${genericPrefix}按要求写出计算或推理结果`;
  }
  
  if (stepIdx === 0) {
    return `${genericPrefix}分析已知条件，写出第一步的推理过程或结果`;
  } else if (stepIdx < 3) {
    return `${genericPrefix}基于上一步结论，继续写出下一步的推导过程`;
  } else {
    return `${genericPrefix}综合以上结果，写出最终答案`;
  }
}

function processFile(filePath, label) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);
  let fixedCount = 0;
  let fixedQuestions = 0;
  
  for (const q of data) {
    if (q.q_type !== 'step' || !Array.isArray(q.steps) || q.steps.length === 0) continue;
    
    let questionChanged = false;
    const newSteps = q.steps.map((step, idx) => {
      const oldPrompt = step.prompt;
      let newPrompt;
      
      try {
        newPrompt = generateStepPrompt(
          oldPrompt, 
          step.answer || '', 
          idx, 
          q.kp_code, 
          q.stem || ''
        );
      } catch (e) {
        console.error(`  错误 D${q.day_tag}-Seq${q.seq_no} Step${idx + 1}:`, e.message);
        return step;
      }
      
      if (newPrompt !== oldPrompt) {
        questionChanged = true;
        fixedCount++;
        console.log(`  🔧 [${label}] D${q.day_tag}-Seq${q.seq_no} Step${idx + 1}:`);
        console.log(`    原: "${oldPrompt.substring(0, 100)}${oldPrompt.length > 100 ? '...' : ''}"`);
        console.log(`    新: "${newPrompt.substring(0, 100)}${newPrompt.length > 100 ? '...' : ''}"`);
      }
      
      return { ...step, prompt: newPrompt };
    });
    
    if (questionChanged) {
      fixedQuestions++;
      q.steps = newSteps;
    }
  }
  
  // 保存文件
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\n📋 ${label} 修复统计: 修改分步${fixedCount}处，涉及题目${fixedQuestions}道`);
  return { fixedCount, fixedQuestions };
}

function main() {
  const baseDir = path.resolve(process.cwd(), 'scripts/data');
  
  console.log('🔧 开始修复S3(初二)分步题...');
  const s3Result = processFile(path.join(baseDir, 's3_seed.json'), 'S3');
  
  console.log('\n\n🔧 开始修复S6(初三)分步题...');
  const s6Result = processFile(path.join(baseDir, 's6_seed.json'), 'S6');
  
  console.log('\n\n🔧 同步检查修复S1(初一)分步题...');
  const s1Result = processFile(path.join(baseDir, 'questions_seed.json'), 'S1');
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ 全部完成！共修复：`);
  console.log(`   S1: ${s1Result.fixedCount}处/${s1Result.fixedQuestions}题`);
  console.log(`   S3: ${s3Result.fixedCount}处/${s3Result.fixedQuestions}题`);
  console.log(`   S6: ${s6Result.fixedCount}处/${s6Result.fixedQuestions}题`);
  console.log('='.repeat(60));
}

main();
