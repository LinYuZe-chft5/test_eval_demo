/**
 * seed_method_cards.ts
 * 方法卡导入脚本
 *
 * 为每个错因编码（EC前缀，4大类16小类+1衔接类）创建基础方法卡。
 * 错因编码体系来源：学科诊断产品设计与题库建设总规范 §错因编码量表
 *
 * DDL中method_cards表结构：
 *   ec_code           VARCHAR(8)  NOT NULL
 *   subject           VARCHAR(16) NOT NULL DEFAULT 'math'
 *   method_name       VARCHAR(64) NOT NULL
 *   method_content    TEXT        NOT NULL
 *   path_4week        JSONB       NOT NULL  -- {w1,w2,w3,w4}
 *   contraindication  TEXT
 *   verification_metric TEXT
 *   version           VARCHAR(8)  NOT NULL DEFAULT 'v1.0'
 *   UNIQUE (ec_code, subject)
 *
 * 运行前必须先执行 prisma db pull && prisma generate 生成 Prisma Client。
 * 用法：npx tsx scripts/seed_method_cards.ts
 */
import { prisma } from '../lib/supabase';

// ---------- 类型定义 ----------

interface Path4Week {
  w1: string;
  w2: string;
  w3: string;
  w4: string;
}

interface MethodCard {
  ec_code: string;
  ec_category: string;
  ec_description: string;
  method_name: string;
  method_content: string;
  path_4week: Path4Week;
  contraindication: string;
  verification_metric: string;
}

// ---------- 方法卡种子数据 ----------
// 错因编码量表：EC-K(知识性) / EC-M(方法性) / EC-C(认知性) / EC-N(非智力) / EC-J(衔接特有)

const methodCards: MethodCard[] = [
  // ========== EC-K 知识性 ==========
  {
    ec_code: 'EC-K1',
    ec_category: '知识性',
    ec_description: '概念理解偏差',
    method_name: '概念溯源法',
    method_content: '回到教材定义，用自己的话复述概念内涵与外延，配套3个正例和1个反例进行辨析。每次遇到概念模糊时立即翻书核对，不允许凭印象答题。',
    path_4week: { w1: '精读定义并标注关键词', w2: '正例反例辨析训练', w3: '变式判断题专项', w4: '综合应用中回归概念' },
    contraindication: '不适用于概念已掌握但运算失误的学生——改用慢算训练法',
    verification_metric: '4周后复测，知识性错因（EC-K类）占比降至20%以下视为有效',
  },
  {
    ec_code: 'EC-K2',
    ec_category: '知识性',
    ec_description: '性质定理混淆或误用',
    method_name: '性质对比辨析法',
    method_content: '将易混淆的性质定理整理为对比表格，标注适用条件与区别要点。每次做题前先判断"用判定还是用性质"，口述依据后再动笔。',
    path_4week: { w1: '整理性质对比表', w2: '条件判断专项训练', w3: '混合题型辨析', w4: '综合证明中准确引用' },
    contraindication: '不适用于性质记忆正确但不会应用的学生——改用模型卡片法',
    verification_metric: '4周后复测，性质混淆类错误减少50%以上视为有效',
  },
  {
    ec_code: 'EC-K3',
    ec_category: '知识性',
    ec_description: '公式记忆或变形错误',
    method_name: '公式推导训练法',
    method_content: '不要求死记公式，而是从基本原理出发推导公式。每周默写2个核心公式及其推导过程，标注每一步的依据。做题时先写公式再代入。',
    path_4week: { w1: '公式推导与默写', w2: '公式变形训练', w3: '公式选择专项', w4: '综合运算中准确套用' },
    contraindication: '推导过程耗时较长，考试临近时需配合速记卡使用',
    verification_metric: '4周后复测，公式类错误减少60%以上视为有效',
  },
  {
    ec_code: 'EC-K4',
    ec_category: '知识性',
    ec_description: '前置知识缺口',
    method_name: '前置补缺法',
    method_content: '通过知识依赖图谱定位缺口的前置知识点，针对性补学小学或前一章内容。每天15分钟前置知识专项练习，持续到前置测验通过率≥80%。',
    path_4week: { w1: '定位缺口并补学定义', w2: '前置专项练习', w3: '前后知识衔接训练', w4: '综合题目中验证补缺效果' },
    contraindication: '前置缺口过多（≥3个）时需先整体补学再进入干预，否则效果有限',
    verification_metric: '4周后前置知识点测验通过率≥80%，且相关题目错误率下降40%以上',
  },

  // ========== EC-M 方法性 ==========
  {
    ec_code: 'EC-M1',
    ec_category: '方法性',
    ec_description: '运算失误',
    method_name: '慢算训练法',
    method_content: '每天10分钟，强制书写每一步运算过程，禁用口算；完成后用逆运算回验。草稿纸分区使用，每题一块区域，步骤编号清晰。',
    path_4week: { w1: '整式运算慢算', w2: '方程求解慢算', w3: '限时准算', w4: '综合运算' },
    contraindication: '不适用于答题时间严重不足的学生——先用草稿分区法提升速度',
    verification_metric: '4周后复测，运算类错因占比降至15%以下视为有效',
  },
  {
    ec_code: 'EC-M2',
    ec_category: '方法性',
    ec_description: '解题程序不规范',
    method_name: '程序固化训练法',
    method_content: '为每类题型建立标准解题程序模板（如解方程五步法），做题时严格按模板填写，不允许跳步。每步写完后打勾确认，逐步养成程序化习惯。',
    path_4week: { w1: '建立解题程序模板', w2: '按模板分步练习', w3: '限时内保持规范', w4: '综合题型程序化' },
    contraindication: '对已具备程序意识但计算粗心的学生效果有限——改用慢算训练法',
    verification_metric: '4周后复测，程序不规范类扣分减少70%以上视为有效',
  },
  {
    ec_code: 'EC-M3',
    ec_category: '方法性',
    ec_description: '方法选择失败/无法迁移',
    method_name: '模型卡片法',
    method_content: '建立条件特征→模型名称→解题套路的对应卡片。做题时先识别题目特征匹配模型，再按套路求解。每周整理1个核心模型的变式题3道。',
    path_4week: { w1: '整理5个核心模型卡片', w2: '模型识别专项训练', w3: '同模型变式练习', w4: '多模型混合实战' },
    contraindication: '基础模型未掌握时不宜引入复杂模型——先确保核心模型熟练',
    verification_metric: '4周后复测，方法选择失败类错因占比降至20%以下视为有效',
  },
  {
    ec_code: 'EC-M4',
    ec_category: '方法性',
    ec_description: '表征转换障碍',
    method_name: '表征转换训练法',
    method_content: '针对文字-符号-图形三种表征进行互译训练。每道应用题先画图、再列式、最后计算；每道几何题先写出已知条件符号化、再画图标注。',
    path_4week: { w1: '文字→符号翻译训练', w2: '符号→图形转换训练', w3: '图形→符号推理训练', w4: '三表征综合互译' },
    contraindication: '阅读理解能力严重不足时需先补语文阅读——此方法不解决语言理解问题',
    verification_metric: '4周后复测，表征转换类错因减少50%以上视为有效',
  },

  // ========== EC-C 认知性 ==========
  {
    ec_code: 'EC-C1',
    ec_category: '认知性',
    ec_description: '审题偏差',
    method_name: '审题标注法',
    method_content: '读题时用笔圈出关键词（数字、条件、问题），在条件旁标注对应符号，问题旁写出"求什么"。读两遍题再动笔：第一遍了解大意，第二遍标注关键信息。',
    path_4week: { w1: '圈注关键词训练', w2: '条件-问题配对训练', w3: '隐含条件挖掘训练', w4: '复杂审题综合训练' },
    contraindication: '对阅读速度极慢的学生需先提升阅读流畅度——标注法会增加阅读负担',
    verification_metric: '4周后复测，审题偏差类错因减少60%以上视为有效',
  },
  {
    ec_code: 'EC-C2',
    ec_category: '认知性',
    ec_description: '思维定势与负迁移',
    method_name: '破执思维训练法',
    method_content: '收集易产生负迁移的题对（形似质异），每次练习先判断"这道题和上一题哪里不同"，再选择解法。建立"防陷阱"错题本，标注陷阱类型。',
    path_4week: { w1: '识别形似题差异', w2: '防陷阱专项练习', w3: '变式对比训练', w4: '综合防陷阱实战' },
    contraindication: '基础概念未牢固时不宜大量练习形似题——可能加重混淆',
    verification_metric: '4周后复测，思维定势类错因减少50%以上视为有效',
  },
  {
    ec_code: 'EC-C3',
    ec_category: '认知性',
    ec_description: '逻辑不严密',
    method_name: '分类讨论训练法',
    method_content: '遇到含参数、绝对值、分类情境的题目时，强制写出"分几种情况"并列表讨论。每类情况独立求解后合并答案。训练"不遗漏"的系统性思维。',
    path_4week: { w1: '识别分类讨论触发条件', w2: '两分类讨论专项', w3: '多分类讨论训练', w4: '综合题中完整讨论' },
    contraindication: '对基础薄弱学生需先确保单一情况解题熟练——分类讨论会增加认知负荷',
    verification_metric: '4周后复测，逻辑不严密类扣分减少60%以上视为有效',
  },
  {
    ec_code: 'EC-C4',
    ec_category: '认知性',
    ec_description: '元认知缺失',
    method_name: '回代验证训练法',
    method_content: '每道题做完后强制执行三步自查：①答案代回原题条件验证；②检查量纲/单位是否合理；③问自己"答案是否符合常识"。养成"做完必验"习惯。',
    path_4week: { w1: '回代验证意识训练', w2: '合理性判断训练', w3: '多方法交叉验证', w4: '综合自查习惯固化' },
    contraindication: '时间紧张时回代验证可能来不及——需在平时训练中提升速度',
    verification_metric: '4周后复测，元认知缺失类错因减少50%以上视为有效',
  },

  // ========== EC-N 非智力 ==========
  {
    ec_code: 'EC-N1',
    ec_category: '非智力',
    ec_description: '表达书写不规范',
    method_name: '书写规范训练法',
    method_content: '建立书写规范清单（解/证明格式、等号对齐、单位标注、答题语完整）。每次作业对照清单自查，不符合规范的重写。使用格子草稿纸约束书写。',
    path_4week: { w1: '规范格式学习与模仿', w2: '对照清单自查练习', w3: '限时内保持规范', w4: '考试场景模拟' },
    contraindication: '对书写速度极慢的学生需先提升书写流畅度——重写可能增加挫败感',
    verification_metric: '4周后复测，书写规范类扣分减少80%以上视为有效',
  },
  {
    ec_code: 'EC-N2',
    ec_category: '非智力',
    ec_description: '粗心与注意缺陷',
    method_name: '注意力聚焦训练法',
    method_content: '使用"指读法"（用笔尖指着每个数字和符号逐字读题）和"抄写核对法"（抄完数字后回头核对一遍）。每天5分钟注意力集中训练，逐步延长专注时长。',
    path_4week: { w1: '指读法习惯养成', w2: '抄写核对训练', w3: '限时专注练习', w4: '复杂计算中保持聚焦' },
    contraindication: '对有ADHD倾向的学生效果有限——需配合专业注意力训练',
    verification_metric: '4周后复测，粗心类错因（抄错数/看错符号）减少60%以上视为有效',
  },
  {
    ec_code: 'EC-N3',
    ec_category: '非智力',
    ec_description: '畏难放弃',
    method_name: '分步拆解法',
    method_content: '将难题拆解为3-5个小步骤，每步只解决一个小问题。遇到困难时先写"我知道什么"和"我需要求什么"，再尝试第一步。建立"至少写一步"的底线要求。',
    path_4week: { w1: '拆题意识训练', w2: '分步得分练习', w3: '部分分值突破训练', w4: '难题攻坚信心建立' },
    contraindication: '对基础极度薄弱的学生需先补基础——拆解后的小步骤也可能无法完成',
    verification_metric: '4周后复测，空白题率降至10%以下视为有效',
  },

  // ========== EC-J 衔接特有 ==========
  {
    ec_code: 'EC-J1',
    ec_category: '衔接特有',
    ec_description: '衔接转换障碍',
    method_name: '算术到代数思维转换法',
    method_content: '从算术思维过渡到代数思维的核心训练：①先算具体数再换字母，对比两种写法；②用"设未知数"替代"倒推法"解应用题；③建立"字母也是数"的直觉。',
    path_4week: { w1: '具体数→字母过渡训练', w2: '设未知数列方程训练', w3: '算术法与代数法对比', w4: '纯代数思维应用' },
    contraindication: '对算术基础薄弱的学生需先巩固算术运算——代数转换需要算术基础支撑',
    verification_metric: '4周后复测，衔接转换类错因减少50%以上，且代数式相关题目正确率提升20%以上',
  },
];

// ---------- 主逻辑 ----------

async function main() {
  console.log('📖 开始导入方法卡数据...\n');
  console.log(`  共 ${methodCards.length} 张方法卡\n`);

  // 按错因大类统计
  const categoryCount: Record<string, number> = {};
  for (const mc of methodCards) {
    categoryCount[mc.ec_category] = (categoryCount[mc.ec_category] || 0) + 1;
  }
  for (const [cat, cnt] of Object.entries(categoryCount)) {
    console.log(`  ${cat}: ${cnt} 张`);
  }
  console.log('');

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const mc of methodCards) {
    try {
      // upsert：以 (ec_code, subject) 为唯一键
      await prisma.methodCards.upsert({
        where: {
          ecCode_subject: {
            ecCode: mc.ec_code,
            subject: 'math',
          },
        },
        update: {
          methodName: mc.method_name,
          methodContent: mc.method_content,
          path4week: mc.path_4week as any,
          contraindication: mc.contraindication,
          verificationMetric: mc.verification_metric,
          version: 'v1.0',
        },
        create: {
          ecCode: mc.ec_code,
          subject: 'math',
          methodName: mc.method_name,
          methodContent: mc.method_content,
          path4week: mc.path_4week as any,
          contraindication: mc.contraindication,
          verificationMetric: mc.verification_metric,
          version: 'v1.0',
        },
      });

      success++;
      console.log(`  ✅ ${mc.ec_code} [${mc.ec_category}] ${mc.method_name} — ${mc.ec_description}`);
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`${mc.ec_code}: ${errMsg}`);
      console.error(`  ❌ ${mc.ec_code} 导入失败: ${errMsg}`);
    }
  }

  // 输出统计
  console.log('\n' + '='.repeat(60));
  console.log('📋 导入统计');
  console.log('='.repeat(60));
  console.log(`  总数: ${methodCards.length}`);
  console.log(`  成功: ${success}`);
  console.log(`  失败: ${failed}`);

  if (errors.length > 0) {
    console.log('\n⚠️ 失败详情:');
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
  }

  console.log('\n' + (failed === 0 ? '🎉 方法卡导入完成！' : `⚠️ 有 ${failed} 张方法卡导入失败。`));
}

main()
  .catch((err) => {
    console.error('💥 脚本执行出错:', err);
    process.exitCode = 1;
  });
