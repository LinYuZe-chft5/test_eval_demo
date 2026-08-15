/**
 * domain/engine/ecDefinitions.ts
 * 错误标签池定义 - 所有EC错误码的标准描述
 * 
 * LLM阅卷时只能从此池中选择错误标签，禁止编造标签池外的错因
 */

export interface ECDefinition {
  code: string;
  label: string;
  description: string;
  category: 'knowledge' | 'cognitive' | 'procedural' | 'meta';
}

export const EC_DEFINITIONS: Record<string, ECDefinition> = {
  'EC-K1': {
    code: 'EC-K1',
    label: '概念未建立',
    description: '对核心概念定义不理解或未掌握，如同类项条件只知其一、绝对值概念混淆等',
    category: 'knowledge',
  },
  'EC-K2': {
    code: 'EC-K2',
    label: '法则记忆混乱',
    description: '运算法则或符号法则记忆错误，如负负得负、移项不变号、去括号半执行等',
    category: 'knowledge',
  },
  'EC-K4': {
    code: 'EC-K4',
    label: '前置知识缺口',
    description: '小学阶段前置知识未掌握，如分数通分、小数除法等前置技能缺失',
    category: 'knowledge',
  },
  'EC-C1': {
    code: 'EC-C1',
    label: '审题不完整',
    description: '漏读条件、扫读失误，如漏看最外层负号、只算前两项就停笔等',
    category: 'cognitive',
  },
  'EC-C2': {
    code: 'EC-C2',
    label: '算术定势迁移',
    description: '小学算术方法负迁移到初中代数，如正数比较规则直接套用到负数、看到加号就按小学加法算',
    category: 'cognitive',
  },
  'EC-C3': {
    code: 'EC-C3',
    label: '分类不完整',
    description: '分类讨论遗漏情况，如绝对值方程只考虑一种情况、几何计数遗漏组合段',
    category: 'cognitive',
  },
  'EC-C4': {
    code: 'EC-C4',
    label: '答非所问',
    description: '求出中间量就停笔，未回答题目最终所问，或检验环节缺失',
    category: 'meta',
  },
  'EC-M1': {
    code: 'EC-M1',
    label: '计算错误',
    description: '基础运算口算出错，如通分后分子运算错、系数加减错等',
    category: 'procedural',
  },
  'EC-M2': {
    code: 'EC-M2',
    label: '程序不完整',
    description: '跳步或解题步骤不完整，如解方程忘除以系数、去括号只变第一项符号',
    category: 'procedural',
  },
  'EC-M3': {
    code: 'EC-M3',
    label: '建模双要素缺失',
    description: '从数据到关系式的建模中只抓变化率漏初始量，或只找初始量漏变化率',
    category: 'procedural',
  },
  'EC-M4': {
    code: 'EC-M4',
    label: '表征转换失败',
    description: '文字→符号转换障碍，如比字句方向写反、数量关系翻译失败、新定义运算无法迁移',
    category: 'cognitive',
  },
  'EC-N2': {
    code: 'EC-N2',
    label: '符号丢失',
    description: '漏写负号或符号判断错误，如系数漏写负号、结果丢失负号等',
    category: 'procedural',
  },
  'EC-J1': {
    code: 'EC-J1',
    label: '衔接障碍',
    description: '算术思维向代数思维转换未完成，如不接受字母参与运算、用算术法硬算不写方程',
    category: 'meta',
  },
};

/**
 * 素养维度定义 - 雷达图维度映射
 */
export const LITERACY_DEFINITIONS: Record<string, { name: string; description: string }> = {
  'YS-01': { name: '数感与符号意识', description: '对数与符号的理解、比较和运算能力' },
  'YS-02': { name: '运算能力', description: '数与式的运算、法则应用和程序执行能力' },
  'YS-03': { name: '空间观念与几何', description: '图形认识、几何推理和数形结合能力' },
  'YS-04': { name: '数据分析', description: '数据收集、整理、分析和推断能力' },
  'YS-05': { name: '推理能力', description: '合情推理和演绎推理能力' },
  'YS-06': { name: '模型思想', description: '数学建模和应用能力' },
  'YS-07': { name: '应用意识', description: '解决实际问题的能力' },
  'YS-08': { name: '创新意识', description: '发现和提出问题、探索新方法的能力' },
  'YS-09': { name: '综合思维', description: '跨知识点综合运用和迁移能力' },
};

/**
 * 根据ec_mapping数组获取错误标签池
 */
export function getErrorLabelPool(ecCodes: string[]): ECDefinition[] {
  const pool: ECDefinition[] = [];
  for (const code of ecCodes) {
    if (EC_DEFINITIONS[code]) {
      pool.push(EC_DEFINITIONS[code]);
    }
  }
  return pool;
}

/**
 * 根据literacy_codes数组获取雷达图维度
 */
export function getRadarDimensions(literacyCodes: string[]): Array<{ dimension: string; weight: number }> {
  return literacyCodes.map(code => ({
    dimension: code,
    weight: 1.0,
  }));
}

/**
 * 根据q_type获取判分模式
 */
export function getGradingMode(qType: string): 'auto' | 'llm' {
  if (qType === 'step') return 'llm';
  return 'auto';
}
