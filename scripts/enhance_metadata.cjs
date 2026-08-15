/**
 * enhance_metadata.cjs
 * 为S1/S3/S6种子数据添加五层流水线所需的标准元数据字段
 * 
 * 新增字段：
 * - error_label_pool: 错误标签池（从ec_mapping+options提取）
 * - radar_dimensions: 雷达图维度+权重（从literacy_codes映射）
 * - scoring_rubric: 评分踩分点
 * - grading_mode: auto | llm
 * - knowledge_points: 一级+二级知识点
 */

const fs = require('fs');
const path = require('path');

// EC码定义
const EC_DEFINITIONS = {
  'EC-K1': { code: 'EC-K1', label: '概念未建立', description: '对核心概念定义不理解或未掌握' },
  'EC-K2': { code: 'EC-K2', label: '法则记忆混乱', description: '运算法则或符号法则记忆错误' },
  'EC-K4': { code: 'EC-K4', label: '前置知识缺口', description: '小学阶段前置知识未掌握' },
  'EC-C1': { code: 'EC-C1', label: '审题不完整', description: '漏读条件、扫读失误' },
  'EC-C2': { code: 'EC-C2', label: '算术定势迁移', description: '小学算术方法负迁移到初中代数' },
  'EC-C3': { code: 'EC-C3', label: '分类不完整', description: '分类讨论遗漏情况' },
  'EC-C4': { code: 'EC-C4', label: '答非所问', description: '求出中间量就停笔，未回答最终问题' },
  'EC-M1': { code: 'EC-M1', label: '计算错误', description: '基础运算口算出错' },
  'EC-M2': { code: 'EC-M2', label: '程序不完整', description: '跳步或解题步骤不完整' },
  'EC-M3': { code: 'EC-M3', label: '建模双要素缺失', description: '只抓变化率漏初始量' },
  'EC-M4': { code: 'EC-M4', label: '表征转换失败', description: '文字→符号转换障碍' },
  'EC-N2': { code: 'EC-N2', label: '符号丢失', description: '漏写负号或符号判断错误' },
  'EC-J1': { code: 'EC-J1', label: '衔接障碍', description: '算术思维向代数思维转换未完成' },
};

// 知识点名称映射
const KP_NAMES = {
  'KP-P.1': '分数运算', 'KP-P.2': '一元一次方程解法', 'KP-P.3': '角与度分秒',
  'KP-P.4': '四则混合运算', 'KP-P.5': '字母表示数',
  'KP-01.1': '正负数意义', 'KP-01.2': '数轴', 'KP-01.3': '绝对值与相反数',
  'KP-01.4': '有理数比较', 'KP-01.5': '有理数加法', 'KP-01.6': '有理数减法',
  'KP-01.7': '有理数加减混合', 'KP-01.8': '有理数乘法', 'KP-01.9': '有理数除法',
  'KP-01.10': '有理数乘方', 'KP-01.11': '有理数混合运算',
  'KP-02.2': '线段计数', 'KP-02.4': '中点与线段和差', 'KP-02.5': '角的概念',
  'KP-02.7': '角平分线与互余互补',
  'KP-03.1': '代数式概念', 'KP-03.2': '列代数式', 'KP-03.3': '关系式与规律',
  'KP-03.4': '代数式求值',
  'KP-04.1': '单项式', 'KP-04.2': '同类项', 'KP-04.3': '去括号法则',
  'KP-04.4': '整式加减',
  'KP-05.1': '等式性质', 'KP-05.2': '一元一次方程概念',
  'KP-05.3': '一元一次方程解法', 'KP-05.4': '一元一次方程应用',
  // S3 知识点
  'KP-06.01': '二元一次方程组概念', 'KP-06.02': '代入消元法', 'KP-06.04': '方程组应用',
  'KP-07.01': '不等式概念', 'KP-07.02': '不等式解法', 'KP-07.03': '不等式组', 'KP-07.04': '不等式应用',
  'KP-08.01': '变量与函数', 'KP-08.02': '一次函数', 'KP-08.03': '函数图象',
  'KP-08.04': '函数性质', 'KP-08.05': '函数与方程',
  'KP-09.01': '整式乘法', 'KP-09.02': '乘法公式', 'KP-09.03': '因式分解',
  'KP-10.01': '分式概念', 'KP-10.02': '分式运算', 'KP-10.03': '分式方程',
  'KP-11.01': '平行线判定', 'KP-11.02': '平行线性质', 'KP-11.03': '三角形',
  'KP-12.01': '全等三角形判定', 'KP-12.02': '全等三角形性质',
  'KP-12.03': '全等三角形应用', 'KP-12.04': '角平分线性质', 'KP-12.05': '尺规作图',
  'KP-13.01': '轴对称', 'KP-13.02': '等腰三角形', 'KP-13.03': '等边三角形',
  'KP-14.01': '实数概念', 'KP-14.02': '平方根', 'KP-14.03': '立方根',
  'KP-15.01': '勾股定理', 'KP-15.02': '勾股定理逆定理', 'KP-15.03': '勾股定理应用',
  'KP-15.04': '勾股数',
  'KP-16.01': '平行四边形性质', 'KP-16.02': '平行四边形判定',
  'KP-16.03': '矩形', 'KP-16.04': '菱形', 'KP-16.05': '正方形',
  'KP-17.01': '一次函数应用', 'KP-17.02': '一次函数与几何',
  'KP-17.03': '数据分析', 'KP-17.04': '频数分布', 'KP-17.05': '方差',
  'KP-18.01': '二次根式概念', 'KP-18.02': '二次根式乘除',
  'KP-18.03': '二次根式加减', 'KP-18.04': '二次根式化简', 'KP-18.05': '二次根式应用',
  'KP-19.01': '一元二次方程概念', 'KP-19.02': '配方法',
  'KP-19.03': '公式法', 'KP-19.04': '因式分解法',
  // S6 知识点
  'KP-20.01': '二次函数概念', 'KP-20.02': '二次函数图象', 'KP-20.03': '二次函数性质',
  'KP-21.01': '相似三角形判定', 'KP-21.02': '相似三角形性质', 'KP-21.03': '相似应用',
  'KP-22.01': '锐角三角函数', 'KP-22.02': '解直角三角形', 'KP-22.03': '三角函数应用',
  'KP-23.01': '一元二次方程解法', 'KP-23.02': '韦达定理与判别式',
  'KP-24.01': '圆的性质', 'KP-24.02': '切线', 'KP-24.03': '弧长与扇形',
  'KP-25.01': '概率概念', 'KP-25.02': '概率计算',
  'KP-26.01': '反比例函数', 'KP-26.02': '反比例函数应用',
  'KP-27.01': '投影与视图', 'KP-27.02': '立体图形',
  'KP-28.01': '统计图表', 'KP-28.02': '数据分析',
  'KP-29.01': '命题与证明', 'KP-29.02': '逻辑推理',
  'KP-30.01': '动点问题',
  'KP-31.01': '综合应用', 'KP-31.02': '函数综合',
  'KP-32.01': '中考综合',
};

function buildErrorLabelPool(question) {
  const codes = new Set();
  
  // 从ec_mapping收集
  if (question.ec_mapping && Array.isArray(question.ec_mapping)) {
    question.ec_mapping.forEach(c => codes.add(c));
  }
  
  // 从options[].ec_code收集
  if (question.options && Array.isArray(question.options)) {
    question.options.forEach(opt => {
      if (opt.ec_code) codes.add(opt.ec_code);
    });
  }
  
  // 从steps[].ec_mapping收集
  if (question.steps && Array.isArray(question.steps)) {
    question.steps.forEach(step => {
      if (step.ec_mapping && Array.isArray(step.ec_mapping)) {
        step.ec_mapping.forEach(c => codes.add(c));
      }
    });
  }
  
  // 转换为标签池对象
  const pool = [];
  for (const code of codes) {
    if (EC_DEFINITIONS[code]) {
      pool.push(EC_DEFINITIONS[code]);
    } else {
      // 未知码也加入池，使用通用描述
      pool.push({ code, label: `未知错误类型(${code})`, description: '' });
    }
  }
  
  return pool;
}

function buildRadarDimensions(question) {
  if (!question.literacy_codes || !Array.isArray(question.literacy_codes)) {
    return [];
  }
  return question.literacy_codes.map(code => ({
    dimension: code,
    weight: 1.0 / question.literacy_codes.length, // 归一化权重
  }));
}

function buildScoringRubric(question) {
  const fullScore = question.score || 0;
  
  if (question.q_type === 'choice') {
    return {
      full_score: fullScore,
      rubric_items: [
        { description: `选对${question.correct_answer}得${fullScore}分`, score: fullScore },
        { description: '选错或不选得0分', score: 0 },
      ],
    };
  }
  
  if (question.q_type === 'fill') {
    return {
      full_score: fullScore,
      rubric_items: [
        { description: `答案等于${question.correct_answer}得${fullScore}分`, score: fullScore },
        { description: '答案错误或无法解析得0分', score: 0 },
      ],
    };
  }
  
  if (question.q_type === 'step' && question.steps) {
    return {
      full_score: fullScore,
      rubric_items: question.steps.map(step => ({
        seq: step.seq,
        description: step.prompt,
        answer: step.answer,
        score: step.score,
      })),
    };
  }
  
  return { full_score: fullScore, rubric_items: [] };
}

function getGradingMode(qType) {
  return qType === 'step' ? 'llm' : 'auto';
}

function getKpName(kpCode) {
  return KP_NAMES[kpCode] || kpCode;
}

function enhanceQuestion(q) {
  const enhanced = { ...q };
  
  // 添加新字段
  enhanced.error_label_pool = buildErrorLabelPool(q);
  enhanced.radar_dimensions = buildRadarDimensions(q);
  enhanced.scoring_rubric = buildScoringRubric(q);
  enhanced.grading_mode = getGradingMode(q.q_type);
  enhanced.knowledge_points = {
    primary: { code: q.kp_code, name: getKpName(q.kp_code) },
    secondary: q.kp_related ? { code: q.kp_related, name: getKpName(q.kp_related) } : null,
  };
  
  return enhanced;
}

function processFile(filePath, label) {
  console.log(`\n📖 处理: ${path.basename(filePath)} (${label})`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    return 0;
  }
  
  const raw = fs.readFileSync(filePath, 'utf-8');
  const questions = JSON.parse(raw);
  console.log(`📊 题数: ${questions.length}`);
  
  let enhanced = 0;
  let hasStep = 0;
  let hasLLM = 0;
  
  const enhancedQuestions = questions.map(q => {
    const eq = enhanceQuestion(q);
    enhanced++;
    if (q.q_type === 'step') hasStep++;
    if (eq.grading_mode === 'llm') hasLLM++;
    return eq;
  });
  
  // 写回文件
  fs.writeFileSync(filePath, JSON.stringify(enhancedQuestions, null, 2), 'utf-8');
  console.log(`✅ 增强: ${enhanced}题, 含分步题: ${hasStep}题, LLM判分: ${hasLLM}题`);
  
  return enhanced;
}

function main() {
  console.log('='.repeat(60));
  console.log('📚 题库元数据标准化增强脚本');
  console.log('='.repeat(60));
  
  const dataDir = path.join(__dirname, 'data');
  
  const files = [
    { file: path.join(dataDir, 'questions_seed.json'), label: 'S1 (初一)' },
    { file: path.join(dataDir, 's3_seed.json'), label: 'S3 (初二)' },
    { file: path.join(dataDir, 's6_seed.json'), label: 'S6 (初三)' },
  ];
  
  let total = 0;
  for (const { file, label } of files) {
    total += processFile(file, label);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`🎉 全部完成! 共增强 ${total} 道题`);
  console.log('\n📋 新增字段说明:');
  console.log('  - error_label_pool: 错误标签池（LLM只能从此池选错因）');
  console.log('  - radar_dimensions: 雷达图维度+权重');
  console.log('  - scoring_rubric: 评分踩分点');
  console.log('  - grading_mode: auto(客观题) | llm(主观题)');
  console.log('  - knowledge_points: 知识点层级映射');
}

main();
