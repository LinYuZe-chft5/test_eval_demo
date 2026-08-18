/**
 * app/report/page.tsx
 * 诊断报告页 —— 展示诊断结果（Server Component，数据在服务端获取）。
 */
import { prisma } from '@/lib/prisma';
import { renderInlineMath } from '@/lib/katex';
import RadarChart, { type RadarDatum } from '@/components/RadarChart';
import type { ReportDraft } from '@/domain/engine/reportBuilder';
import type { MasteryLevel } from '@/domain/engine/mastery';

// 渲染含数学公式的文本（服务端渲染）
function MathText({ text }: { text: string }) {
  if (!text) return null;
  const html = renderInlineMath(text);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

interface PageProps {
  searchParams: { student_id?: string };
}

// Next.js App Router 动态路由标记
// 报告页依赖 searchParams (student_id) 从数据库读取实时数据
// 必须禁用静态生成（否则构建时 request.url 会报错）
export const dynamic = 'force-dynamic';

const LEVEL_TEXT: Record<MasteryLevel, string> = {
  green: '掌握良好',
  yellow: '基本掌握',
  red: '待加强',
};

// ===== 模块级映射（用于未知KP代码的兜底） =====
const MODULE_NAMES: Record<string, string> = {
  '01': '有理数',
  '02': '线段与角',
  '03': '代数式与整式',
  '04': '方程与不等式',
  '05': '方程与不等式',
  '06': '方程组',
  '07': '不等式',
  '08': '函数',
  '09': '整式乘法与因式分解',
  '10': '分式',
  '11': '平行线与三角形',
  '12': '全等三角形',
  '13': '三角形综合',
  '14': '三角形',
  '23': '一元二次方程',
  '24': '圆',
  '25': '概率',
  '26': '二次函数',
  '27': '反比例函数',
  '28': '概率',
  '29': '相似三角形',
  '30': '锐角三角函数',
  '31': '投影与视图',
  '32': '二次函数',
  'P': '小升初衔接',
  'G': '几何综合',
};

// 知识点中文名称映射（全量，覆盖所有初一初二初三知识点）
const KP_NAME_MAP: Record<string, string> = {
  // ===== 小升初衔接（S1 前置知识） =====
  'KP-P.1': '分数运算',
  'KP-P.2': '一元一次方程解法',
  'KP-P.3': '角与度分秒',
  'KP-P.4': '四则混合运算',
  'KP-P.5': '比例与比例尺',
  'KP-P.6': '正比例函数',
  'KP-P.7': '反比例函数',

  // ===== 初一上（S1 身份） =====
  'KP-01.1': '正负数意义',
  'KP-01.2': '数轴',
  'KP-01.3': '绝对值与相反数',
  'KP-01.4': '有理数比较',
  'KP-01.5': '有理数加法',
  'KP-01.6': '有理数减法',
  'KP-01.8': '有理数乘法',
  'KP-01.9': '有理数除法',
  'KP-01.10': '有理数乘方',
  'KP-01.11': '有理数混合运算',
  
  // 兼容格式（LLM可能生成的变体）
  'KP-01.01': '正负数与有理数概念',
  'KP-01.02': '数轴与绝对值',
  'KP-01.7': '有理数乘方',
  'KP-01.07': '有理数乘方',

  // ===== 初一几何（线段与角） =====
  'KP-02.1': '线段概念',
  'KP-02.2': '线段计数',
  'KP-02.3': '线段长度',
  'KP-02.4': '线段中点',
  'KP-02.5': '角的概念',
  'KP-02.6': '角的度量',
  'KP-02.7': '互补角',
  'KP-02.8': '互余角',
  'KP-02.9': '角平分线',
  'KP-02.01': '线段概念',
  'KP-02.02': '线段计数',
  'KP-02.04': '线段中点',
  'KP-02.07': '互补角',

  // ===== 初一下（S1 身份） =====
  'KP-03.1': '代数式概念',
  'KP-03.2': '列代数式',
  'KP-03.01': '代数式与整式概念',
  'KP-03.02': '代入求值与整式运算',
  'KP-03.3': '整式加减',
  'KP-03.03': '整式加减',
  
  'KP-04.1': '单项式',
  'KP-04.2': '同类项',
  'KP-04.01': '一元一次方程',
  'KP-04.02': '一元一次不等式',
  'KP-04.03': '含参方程与不等式',
  'KP-04.3': '等式性质',
  'KP-04.4': '方程解法',
  'KP-04.5': '方程应用',
  'KP-04.6': '不等式解法',
  'KP-04.7': '不等式应用',
  
  'KP-05.1': '等式性质',
  'KP-05.2': '方程解法',
  'KP-05.3': '方程应用',
  'KP-05.4': '不等式解法',
  'KP-05.5': '不等式组',
  'KP-05.6': '含参不等式',
  'KP-05.7': '不等式应用',
  'KP-05.8': '方程与不等式综合',

  // ===== 初二（S3-01 身份）—— 从s3_seed.json实际提取 =====
  'KP-06.01': '二元一次方程组概念',
  'KP-06.02': '代入消元法',
  'KP-06.03': '加减消元法',
  'KP-06.04': '方程组应用',
  'KP-06.05': '方程组整数解',
  'KP-06.1': '二元一次方程组概念',
  'KP-06.2': '代入消元法',
  'KP-06.3': '加减消元法',
  'KP-06.4': '方程组应用',
  'KP-06.5': '方程组整数解',

  'KP-07.01': '不等式概念',
  'KP-07.02': '不等式解法',
  'KP-07.03': '不等式组',
  'KP-07.04': '不等式应用',
  'KP-07.05': '含参不等式组',
  'KP-07.06': '不等式组整数解',
  'KP-07.07': '不等式与角平分线综合',
  'KP-07.1': '不等式概念',
  'KP-07.2': '不等式解法',
  'KP-07.3': '不等式组',
  'KP-07.4': '不等式应用',
  'KP-07.5': '含参不等式组',
  'KP-07.6': '不等式组整数解',
  'KP-07.7': '不等式与角平分线综合',

  'KP-08.01': '变量与函数',
  'KP-08.02': '一次函数',
  'KP-08.03': '函数图象',
  'KP-08.04': '函数性质',
  'KP-08.1': '变量与函数',
  'KP-08.2': '一次函数',
  'KP-08.3': '函数图象',
  'KP-08.4': '函数性质',

  'KP-09.01': '整式乘法',
  'KP-09.02': '乘法公式',
  'KP-09.03': '因式分解',
  'KP-09.04': '因式分解综合技巧',
  'KP-09.05': '因式分解应用',
  'KP-09.06': '十字相乘法',
  'KP-09.1': '整式乘法',
  'KP-09.2': '乘法公式',
  'KP-09.3': '因式分解',
  'KP-09.4': '因式分解综合技巧',
  'KP-09.5': '因式分解应用',
  'KP-09.6': '十字相乘法',

  'KP-10.01': '分式概念',
  'KP-10.02': '分式运算',
  'KP-10.03': '分式方程',
  'KP-10.04': '分式化简求值',
  'KP-10.05': '三角形角度计算综合',
  'KP-10.1': '分式概念',
  'KP-10.2': '分式运算',
  'KP-10.3': '分式方程',
  'KP-10.4': '分式化简求值',
  'KP-10.5': '三角形角度计算综合',

  'KP-11.01': '平行线判定',
  'KP-11.02': '平行线性质',
  'KP-11.03': '平行线综合应用',
  'KP-11.04': '含参不等式组',
  'KP-11.1': '平行线判定',
  'KP-11.2': '平行线性质',
  'KP-11.3': '平行线综合应用',
  'KP-11.4': '含参不等式组',

  'KP-12.01': '全等三角形判定',
  'KP-12.02': '全等三角形性质',
  'KP-12.03': '角平分线与全等',
  'KP-12.04': '全等三角形证明',
  'KP-12.1': '全等三角形判定',
  'KP-12.2': '全等三角形性质',
  'KP-12.3': '角平分线与全等',
  'KP-12.4': '全等三角形证明',

  'KP-13.01': '三角形基本概念',
  'KP-13.02': '三角形边角关系',
  'KP-13.03': '全等三角形综合证明',
  'KP-13.04': '全等三角形判定与性质综合',
  'KP-13.1': '三角形基本概念',
  'KP-13.2': '三角形边角关系',
  'KP-13.3': '全等三角形综合证明',
  'KP-13.4': '全等三角形判定与性质综合',

  'KP-14.01': '三角形三边关系',
  'KP-14.02': '三角形中线与高',
  'KP-14.03': '三角形内角与外角',
  'KP-14.04': '多边形内角和',
  'KP-14.1': '三角形三边关系',
  'KP-14.2': '三角形中线与高',
  'KP-14.3': '三角形内角与外角',
  'KP-14.4': '多边形内角和',

  // ===== 初三（S6-01 身份）—— 全量覆盖所有s6_seed.json知识点 =====
  'KP-23.01': '一元二次方程解法',
  'KP-23.02': '韦达定理与判别式',
  'KP-23.03': '一元二次方程应用',
  'KP-23.1': '一元二次方程解法',
  'KP-23.2': '韦达定理与判别式',
  'KP-23.3': '一元二次方程应用',

  'KP-24.01': '圆的性质',
  'KP-24.02': '切线',
  'KP-24.03': '圆与圆位置关系',
  'KP-24.04': '弧长与扇形',
  'KP-24.05': '圆柱与圆锥',
  'KP-24.06': '圆的综合应用',
  'KP-24.07': '圆与相似三角形',
  'KP-24.1': '圆的性质',
  'KP-24.2': '切线',
  'KP-24.3': '圆与圆位置关系',
  'KP-24.4': '弧长与扇形',
  'KP-24.5': '圆柱与圆锥',
  'KP-24.6': '圆的综合应用',
  'KP-24.7': '圆与相似三角形',

  'KP-25.01': '概率概念',
  'KP-25.02': '概率计算',
  'KP-25.1': '概率概念',
  'KP-25.2': '概率计算',

  'KP-26.01': '二次函数图象',
  'KP-26.02': '二次函数性质',
  'KP-26.1': '二次函数图象',
  'KP-26.2': '二次函数性质',

  'KP-27.01': '反比例函数',
  'KP-27.1': '反比例函数',
  'KP-27.01': '反比例函数',

  'KP-28.01': '概率初步',
  'KP-28.02': '用列举法求概率',
  'KP-28.03': '用频率估计概率',
  'KP-28.04': '概率的应用',
  'KP-28.05': '随机事件',
  'KP-28.06': '几何概型',
  'KP-28.1': '概率初步',
  'KP-28.2': '用列举法求概率',
  'KP-28.3': '用频率估计概率',
  'KP-28.4': '概率的应用',
  'KP-28.5': '随机事件',
  'KP-28.6': '几何概型',

  'KP-29.01': '相似三角形判定',
  'KP-29.02': '相似三角形性质与应用',
  'KP-29.03': '相似三角形综合',
  'KP-29.04': '位似',
  'KP-29.1': '相似三角形判定',
  'KP-29.2': '相似三角形性质与应用',
  'KP-29.3': '相似三角形综合',
  'KP-29.4': '位似',

  'KP-30.01': '锐角三角函数',
  'KP-30.1': '锐角三角函数',

  'KP-31.01': '投影与视图',
  'KP-31.02': '投影与视图应用',
  'KP-31.1': '投影与视图',
  'KP-31.2': '投影与视图应用',

  'KP-32.01': '二次函数综合',
  'KP-32.02': '二次函数与几何综合',
  'KP-32.1': '二次函数综合',
  'KP-32.2': '二次函数与几何综合',

  // ===== 备用兜底映射 =====
  'KP-G01': '相交线与对顶角',
  'KP-G02': '平行线判定',
  'KP-G03': '平行线性质',
  'KP-G04': '平移变换',
  'KP-G05': '角平分线定理',
  'KP-G06': '几何综合题',
  'KP-G07': '辅助线构造',
};

function getKpName(kpCode: string): string {
  if (!kpCode) return '';
  // 清理可能的前缀（如 "知识点KP-07.06" -> "KP-07.06"）
  let cleanCode = kpCode.trim();
  // 移除常见前缀
  const prefixes = ['知识点', '考点', '焦点', '补强', 'KP：', 'KP:', 'kp：', 'kp:'];
  for (const prefix of prefixes) {
    if (cleanCode.startsWith(prefix)) {
      cleanCode = cleanCode.slice(prefix.length).trim();
      break;
    }
  }
  // 统一为大写 KP- 格式
  if (cleanCode.toLowerCase().startsWith('kp-')) {
    cleanCode = 'KP-' + cleanCode.slice(3);
  }
  // 直接查找映射表
  if (KP_NAME_MAP[cleanCode]) return KP_NAME_MAP[cleanCode];
  
  // 尝试补齐格式：KP-05.4 → KP-05.04
  const paddedCode = cleanCode.replace(/KP-(\d+)\.(\d+)/g, (m, mod, sub) => {
    const modStr = String(mod).padStart(2, '0');
    const subStr = String(sub).padStart(2, '0');
    return `KP-${modStr}.${subStr}`;
  });
  if (KP_NAME_MAP[paddedCode]) return KP_NAME_MAP[paddedCode];
  
  // 尝试去掉补零：KP-05.04 → KP-05.4
  const unpaddedCode = cleanCode.replace(/KP-(\d+)\.0(\d+)/g, (m, mod, sub) => {
    return `KP-${mod}.${sub}`;
  });
  if (KP_NAME_MAP[unpaddedCode]) return KP_NAME_MAP[unpaddedCode];
  
  // 模块级兜底：从代码中提取模块号
  const modMatch = cleanCode.match(/KP-(\w+)\.\d+/);
  if (modMatch && MODULE_NAMES[modMatch[1]]) {
    // 尝试找该模块下任何已有映射
    const modPrefix = `KP-${modMatch[1]}.`;
    for (const key of Object.keys(KP_NAME_MAP)) {
      if (key.startsWith(modPrefix)) {
        return MODULE_NAMES[modMatch[1]];
      }
    }
    return MODULE_NAMES[modMatch[1]];
  }
  
  // 如果本身就是中文名（不在映射表中），直接返回
  if (!cleanCode.startsWith('KP-')) return cleanCode;
  
  // 最后兜底：尝试提取模块名
  if (cleanCode.startsWith('KP-')) {
    const parts = cleanCode.slice(3).split('.');
    if (parts.length >= 1 && MODULE_NAMES[parts[0]]) {
      return MODULE_NAMES[parts[0]];
    }
  }
  
  return cleanCode;
}

// 替换文本中所有 KP 代码为中文名称（更健壮的正则）
function replaceKpCodesInText(text: string): string {
  if (!text) return '';
  // 匹配多种格式的KP代码：KP-05.4, KP-05.04, KP-P.1, KP-G01, KP-29.03, kp-05.4等
  // 支持大小写、多种前缀（知识点、考点、焦点、补强）
  return text.replace(/(知识点|考点|焦点|补强)?\s*[Kk][Pp]-[A-Za-z]*\d*\.\d+/g, function (match) {
    // 提取核心KP代码（去除前缀）
    let coreCode = match.trim();
    const prefixes = ['知识点', '考点', '焦点', '补强'];
    for (const p of prefixes) {
      if (coreCode.startsWith(p)) {
        coreCode = coreCode.slice(p.length).trim();
        break;
      }
    }
    // 统一为大写 KP- 格式
    coreCode = coreCode.replace(/^kp-/i, 'KP-');
    return getKpName(coreCode);
  });
}

// 错因代码中文描述
const EC_DESC: Record<string, string> = {
  'EC-K1': '概念理解不清',
  'EC-K2': '公式/法则记忆错误',
  'EC-K3': '运算步骤有误',
  'EC-C1': '审题不仔细',
  'EC-C2': '条件运用不当',
  'EC-C3': '计算失误',
  'EC-C4': '逻辑推理跳跃',
  'EC-M1': '方法选择不当',
  'EC-M2': '运算技能不熟练',
  'EC-M3': '空间想象力不足',
  'EC-M4': '证明书写不规范',
};

function getEcDesc(ecCode: any): string {
  if (ecCode === null || ecCode === undefined) return '';
  if (typeof ecCode === 'string') return EC_DESC[ecCode] || ecCode;
  if (typeof ecCode === 'object') {
    const code = (ecCode as any).code;
    return code ? (EC_DESC[code] || (ecCode as any).label || String(code)) : '';
  }
  return String(ecCode);
}

// 素养维度中文描述
const LITERACY_DESC: Record<string, string> = {
  'YS-01': '知识理解',
  'YS-02': '运算能力',
  'YS-03': '空间想象',
  'YS-04': '数据处理',
  'YS-05': '逻辑推理',
  'YS-06': '模型构建',
  'YS-07': '应用创新',
  'YS-08': '数学阅读',
};

function getLiteracyDesc(litCode: string): string {
  return LITERACY_DESC[litCode] || litCode;
}
const LEVEL_COLOR: Record<MasteryLevel, string> = {
  green: 'text-green-600',
  yellow: 'text-amber-600',
  red: 'text-red-600',
};
const ADAPT_TEXT: Record<string, string> = {
  pass: '达标',
  basic: '基本达标',
  weak: '待加强',
};
const ADAPT_COLOR: Record<string, string> = {
  pass: 'text-green-600',
  basic: 'text-amber-600',
  weak: 'text-red-600',
};

function isLowCredibility(flags: unknown): boolean {
  if (!Array.isArray(flags)) {
    return false;
  }
  let result = false;
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    const flagStr = String(f?.flag ?? '').toLowerCase();
    if (flagStr.indexOf('low') >= 0) {
      result = true;
      break;
    }
    if (flagStr.indexOf('credibility') >= 0) {
      result = true;
      break;
    }
    if (flagStr === 'l') {
      result = true;
      break;
    }
  }
  return result;
}

function buildNarrative(draft: ReportDraft): string {
  const totalScore = draft.total_score ?? 0;
  const adaptiveText = draft.adaptive_level ?? '待加强';
  let greenCount = 0;
  let redCount = 0;
  if (draft.module_mastery) {
    const values = Object.values(draft.module_mastery);
    for (let i = 0; i < values.length; i++) {
      const v = values[i] as any;
      if (v?.level === 'green') greenCount++;
      if (v?.level === 'red') redCount++;
    }
  }
  let text = '本次诊断总分为 ' + totalScore + ' 分，综合评定为' + adaptiveText + '。';
  text += '掌握良好考点 ' + greenCount + ' 个，薄弱考点 ' + redCount + ' 个。';
  if (draft.ec_profile?.primary) {
    const primaryStr = typeof draft.ec_profile.primary === 'object'
      ? getEcDesc(draft.ec_profile.primary)
      : getEcDesc(String(draft.ec_profile.primary));
    if (primaryStr) text += '主要错因为 ' + primaryStr + '。';
  }
  if (draft.plan_4week && draft.plan_4week.length > 0) {
    text += '已为您生成 ' + draft.plan_4week.length + ' 周干预计划，建议按计划进行针对性训练。';
  }
  if (draft.action_checklist && draft.action_checklist.length > 0) {
    text += '重点关注基础概念回归和变式训练。';
  }
  return text;
}

export default async function ReportPage({ searchParams }: PageProps) {
  const studentId = searchParams.student_id;

  if (!studentId) {
    return (
      <EmptyReport message="缺少学生标识，无法查看报告。" />
    );
  }

  const row = await (prisma as any).reportDrafts.findFirst({
    where: { studentId: Number(studentId) },
    orderBy: { createdAt: 'desc' },
  });

  if (!row) {
    return (
      <EmptyReport message="报告尚未生成。请完成全部三天诊断后再查看。" />
    );
  }

  // ===== 获取错题数据（直接从数据库读取，不走LLM） =====
  // 1. 查询该学生所有答错的记录
  const wrongRecords: any[] = await (prisma as any).records.findMany({
    where: { studentId: Number(studentId), isCorrect: false },
  });

  // 2. 获取所有相关题目（含题干、标准答案、解析）
  const wrongQuestionIds = [...new Set(wrongRecords.map((r: any) => Number(r.questionId)))];
  const wrongQuestions: any[] = wrongQuestionIds.length > 0
    ? await (prisma as any).questions.findMany({ where: { id: { in: wrongQuestionIds } } })
    : [];

  // 3. 构建错题列表（按Day分组）
  const wrongQuestionMap = new Map<number, any>();
  for (const q of wrongQuestions) {
    wrongQuestionMap.set(Number(q.id), q);
  }

  interface WrongQuestionItem {
    day: number;
    questionId: string;
    stem: string;
    qType: string;
    correctAnswer: string;
    solution: string;
    studentAnswer: string;
    errorAnalysis: string;
    kpName: string;
  }

  const wrongQuestionsByDay: Record<number, WrongQuestionItem[]> = { 1: [], 2: [], 3: [] };

  for (const record of wrongRecords) {
    const qId = Number(record.questionId);
    const q = wrongQuestionMap.get(qId);
    if (!q) continue;

    const day = Number(q.dayTag ?? q.day_tag ?? 1);
    if (!wrongQuestionsByDay[day]) wrongQuestionsByDay[day] = [];

    // 获取学生答案
    let studentAnswerStr = '';
    const rawAns = record.studentAnswer ?? record.student_answer;
    if (typeof rawAns === 'string') {
      studentAnswerStr = rawAns;
    } else if (rawAns !== null && rawAns !== undefined) {
      studentAnswerStr = JSON.stringify(rawAns);
    }

    // 获取错因分析
    const ecCodes = Array.isArray(record.ecCode) ? record.ecCode : (record.ecCode ? [record.ecCode] : []);
    const ecFinalCodes = Array.isArray(record.ecFinal) ? record.ecFinal : (record.ecFinal ? [record.ecFinal] : []);
    const allEcCodes = [...new Set([...ecCodes, ...ecFinalCodes])];
    const errorAnalysis = allEcCodes.length > 0
      ? allEcCodes.map((code: string) => EC_DESC[code] || code).join('、')
      : '答案错误';

    // 获取知识点名称
    const kpCode = q.kpCode ?? q.kp_code ?? '';
    const kpName = getKpName(kpCode);

    wrongQuestionsByDay[day].push({
      day,
      questionId: `${q.skuCode ?? q.sku_code}-D${day}-Q${String(q.seqNo ?? q.seq_no ?? 0).padStart(2, '0')}`,
      stem: q.stem ?? '',
      qType: q.qType ?? q.q_type ?? '',
      correctAnswer: q.correctAnswer ?? q.correct_answer ?? '',
      solution: q.solution ?? q.improvementTip ?? q.improvement_tip ?? '',
      studentAnswer: studentAnswerStr || '未作答',
      errorAnalysis,
      kpName,
    });
  }

  const totalWrongCount = Object.values(wrongQuestionsByDay).reduce((sum, arr) => sum + arr.length, 0);

  const hasNewStructuredData = (
    row.literacyRadar !== undefined &&
    row.moduleMastery !== undefined &&
    row.totalScore !== undefined
  );

  const fallbackDraft: ReportDraft = row.degradedTexts && !hasNewStructuredData
    ? (row.degradedTexts as ReportDraft)
    : null;

  const degradedTextListFromStructured: any[] = Array.isArray((row as any).degraded_texts)
    ? (row as any).degraded_texts
    : [];

  const draft: ReportDraft = fallbackDraft ?? {
    total_score: row.totalScore ?? 0,
    adaptive_level: row.adaptiveLevel ?? 'weak',
    module_mastery: row.moduleMastery ?? {},
    literacy_radar: row.literacyRadar ?? {},
    ec_profile: row.ecProfile ?? { primary: null, secondary: null, distribution: {}, low_confidence_notes: [] },
    confidence_flags: row.confidenceFlags ?? [],
    plan_4week: row.plan4week ?? [],
    action_checklist: row.actionChecklist ?? [],
    narrative_text: row.narrativeText ?? '',
    degraded_texts: degradedTextListFromStructured,
  };

  // 模块掌握度列表
  const moduleList: { module: string; score: number; level: MasteryLevel; kpCode: string }[] = [];
  const masteryEntries = Object.entries(draft.module_mastery ?? {});
  for (let i = 0; i < masteryEntries.length; i++) {
    const [kp, entry] = masteryEntries[i];
    const rawName = (entry as any)?.kp_name || kp;
    const kpName = getKpName(rawName);
    const masteryValue = Number((entry as any).mastery_score);
    let level = (entry as any).level as MasteryLevel;
    
    if (!level || !['green', 'yellow', 'red'].includes(level)) {
      if (masteryValue >= 0.8) level = 'green';
      else if (masteryValue >= 0.5) level = 'yellow';
      else level = 'red';
    }
    
    if (!isNaN(masteryValue) && isFinite(masteryValue)) {
      moduleList.push({ module: kpName, score: masteryValue, level: level, kpCode: kp });
    }
  }
  moduleList.sort(function (a, b) { return a.score - b.score; });

  // 素养雷达
  const radarRaw = Object.entries(draft.literacy_radar ?? {});
  const radarData: RadarDatum[] = [];
  const seenDims = new Set<string>();
  for (let i = 0; i < radarRaw.length; i++) {
    const [dim, val] = radarRaw[i];
    if (!val || seenDims.has(dim)) continue;
    seenDims.add(dim);
    // RadarChart组件期望 dimension 字段（不是label）
    const dimLabel = getLiteracyDesc(dim);
    const scoreVal = typeof val === 'object' ? Number((val as any).score ?? 0) : Number(val) || 0;
    // 归一化到0-1范围（如果score是0-100则转换为0-1）
    const normalizedVal = scoreVal > 1 ? scoreVal / 100 : scoreVal;
    radarData.push({
      dimension: dimLabel,
      value: normalizedVal,
    });
  }

  const hasPrimaryEc = !!draft.ec_profile?.primary;
  const hasSecondaryEc = !!draft.ec_profile?.secondary;
  const hasLowConfNotes = !!(draft.ec_profile?.low_confidence_notes && draft.ec_profile.low_confidence_notes.length > 0);
  const hasPlan = !!(draft.plan_4week && draft.plan_4week.length > 0);
  const hasChecklist = !!(draft.action_checklist && draft.action_checklist.length > 0);
  const hasNarrative = !!draft.narrative_text;
  const radarEmpty = radarData.length < 3;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-bold text-center">诊断报告</h1>
        <p className="text-center text-xs text-gray-500">学生标识：{studentId}</p>
      </header>

      <main className="max-w-2xl mx-auto px-4 space-y-4 pt-4">
        {/* 适应性评定 */}
        <Section title="适应性评定">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">综合评定</span>
            <span className={`text-lg font-bold ${ADAPT_COLOR[draft.adaptive_level as keyof typeof ADAPT_COLOR] || 'text-amber-600'}`}>
              {ADAPT_TEXT[draft.adaptive_level as keyof typeof ADAPT_TEXT] || draft.adaptive_level}
            </span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-sm text-gray-600">总分</span>
            <span className="text-lg font-bold text-blue-600">{draft.total_score} 分</span>
          </div>
        </Section>

        {/* 模块掌握度 */}
        <Section title="模块掌握度">
          {moduleList.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-4">暂无模块掌握度数据</div>
          ) : (
            <ul className="space-y-2">
              {moduleList.map(function renderM(m, i) {
                const displayPercent = Math.round(m.score * 100);
                const widthStyle = { width: `${displayPercent}%` };
                return (
                  <li key={m.module + i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{m.module}</span>
                      <span className={'font-medium ' + LEVEL_COLOR[m.level]}>
                        {LEVEL_TEXT[m.level]}（{displayPercent}%）
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={widthStyle}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* 错题分析 */}
        <Section title={`错题分析（共${totalWrongCount}道错题）`}>
          {totalWrongCount === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center">
              <p className="text-xs text-gray-500 font-medium">无错题记录</p>
              <p className="text-[11px] text-gray-400 mt-1">本次诊断全部答对，表现优秀！</p>
            </div>
          ) : (
            <div className="space-y-4">
              {[1, 2, 3].map(day => {
                const dayQuestions = wrongQuestionsByDay[day] || [];
                if (dayQuestions.length === 0) return null;
                return (
                  <div key={day} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                        Day {day}
                      </span>
                      <span className="text-[11px] text-gray-400">共{dayQuestions.length}道错题</span>
                    </div>
                    <div className="space-y-3">
                      {dayQuestions.map((wq, idx) => (
                        <div key={day + '-' + idx} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-1.5">
                          {/* 题目序号 + 知识点 */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-700">
                              第{idx + 1}题 ({wq.questionId})
                            </span>
                            <span className="text-[10px] text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                              {wq.kpName}
                            </span>
                          </div>
                          {/* 题干 */}
                          <div className="text-xs text-gray-800 leading-relaxed">
                            <span className="text-gray-400 text-[10px]">题干：</span>
                            <MathText text={wq.stem} />
                          </div>
                          {/* 学生答案 vs 标准答案 */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-red-50 border border-red-100 rounded px-2 py-1">
                              <span className="text-red-400 text-[10px] block mb-0.5">学生答案</span>
                              <span className="text-red-700">{wq.studentAnswer}</span>
                            </div>
                            <div className="bg-green-50 border border-green-100 rounded px-2 py-1">
                              <span className="text-green-500 text-[10px] block mb-0.5">标准答案</span>
                              <span className="text-green-700"><MathText text={wq.correctAnswer} /></span>
                            </div>
                          </div>
                          {/* 完整解析 */}
                          {wq.solution && (
                            <div className="text-xs text-gray-600 leading-relaxed bg-white rounded px-2 py-1.5 border border-gray-100">
                              <span className="text-blue-500 text-[10px] font-medium block mb-0.5">解析</span>
                              <MathText text={wq.solution} />
                            </div>
                          )}
                          {/* 错因分析 */}
                          <div className="text-xs text-orange-700 leading-relaxed bg-orange-50 rounded px-2 py-1 border border-orange-100">
                            <span className="text-orange-400 text-[10px] font-medium">错因：</span>
                            {wq.errorAnalysis}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* 素养雷达图 */}
        <Section title="素养雷达图">
          {radarEmpty ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 space-y-2 text-center">
              <div className="text-3xl">🕸️</div>
              <p className="text-xs text-gray-500 font-medium">素养雷达图未生成</p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                各素养维度需要至少2道真实作答题数才能渲染雷达图
              </p>
            </div>
          ) : (
            <RadarChart data={radarData} max={1} />
          )}
        </Section>

        {/* 首要错因及改进建议 */}
        <Section title="首要错因及改进建议">
          {hasPrimaryEc ? (
            <div className="space-y-1 text-sm">
              <p>
                首要错因：
                <span className="font-semibold text-red-600">
                  {getEcDesc(draft.ec_profile!.primary!)}
                </span>
              </p>
              {hasSecondaryEc && (
                <p className="text-gray-500">
                  次要错因：{getEcDesc(draft.ec_profile!.secondary!)}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="text-amber-600 font-medium">暂无显著归因错因</p>
              <p className="text-xs text-gray-500">
                错题样本不足或学生整体发挥较为稳定。建议关注错题涉及的知识点进行综合复习。
              </p>
            </div>
          )}
        </Section>

        {/* 4周干预计划 */}
        <Section title="4周干预计划">
          {hasPlan ? (
            <ol className="space-y-3">
              {draft.plan_4week!.map(function renderWeek(w: any, idx: number) {
                let focusKpNames = '';
                if (w.focus_kps && w.focus_kps.length) {
                  focusKpNames = w.focus_kps.map(function (kp: string) { 
                    return getKpName(kp);
                  }).filter(Boolean).join('、');
                } else if (w.focus_kp) {
                  focusKpNames = getKpName(w.focus_kp);
                }
                
                if (!focusKpNames) {
                  const weekTheme = ['基础概念巩固', '变式训练提升', '综合应用强化', '查漏补缺冲刺'];
                  focusKpNames = weekTheme[idx] || '综合能力提升';
                }
                
                let weeklyContent = '';
                if (w.weekly_content && w.weekly_content.length) {
                  weeklyContent = w.weekly_content.map((c: string) => {
                    let content = replaceKpCodesInText(c);
                    if (content.length < 10 && !content.includes('练习')) return content + '，建议配合教材例题加深理解';
                    return content;
                  }).join('；');
                } else if (w.content && typeof w.content === 'string') {
                  weeklyContent = replaceKpCodesInText(w.content);
                }
                
                if (!weeklyContent) {
                  const weekSuggestions = [
                    '从基础例题入手，每天完成5-8道基础练习题，确保概念准确无误',
                    '进行变式训练，每天完成6-10道变式题，检验知识掌握的灵活性',
                    '完成综合应用题，每天3-5道涉及多个知识点的综合题，训练知识迁移能力',
                    '进行模拟测试，完成一套小测检验学习成果，针对薄弱环节重点突破',
                  ];
                  weeklyContent = weekSuggestions[idx] || weekSuggestions[0];
                }
                
                const weekNum = w.week || (idx + 1);
                const practiceCount = w.practice_count || w.daily_count;
                
                return (
                  <li
                    key={weekNum}
                    className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-800">
                        第 {weekNum} 周
                      </div>
                      <div className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        {['基础巩固', '变式提升', '综合应用', '查漏补缺'][idx] || '持续训练'}
                      </div>
                    </div>
                    <div className="text-xs text-gray-600 mt-1.5">
                      <span className="text-gray-400">焦点：</span>
                      <span className="font-medium">{focusKpNames}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                      <span className="text-gray-400">训练：</span>
                      {weeklyContent}
                    </div>
                    {practiceCount && (
                      <div className="text-xs text-gray-400 mt-1">
                        💡 建议每日练习量：{practiceCount} 道题
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3">
              <p className="text-xs text-gray-500 font-medium">📋 4周干预计划生成中...</p>
            </div>
          )}
        </Section>

        {/* 行动清单 */}
        {hasChecklist && (
          <Section title="行动清单">
            <ul className="space-y-2 text-sm">
              {draft.action_checklist!.map(function renderAction(a: any, i: number) {
                let kpName = '';
                if (a.kp_code) {
                  kpName = getKpName(a.kp_code);
                } else if (a.name) {
                  kpName = getKpName(a.name);
                } else if (a.kp_name) {
                  kpName = getKpName(a.kp_name);
                }
                if (!kpName) {
                  kpName = '薄弱知识点';
                }
                
                let levelText = LEVEL_TEXT[a.level];
                let levelColor = LEVEL_COLOR[a.level];
                if (!levelText) {
                  const severity = String(a.severity || '').toLowerCase();
                  if (severity === '高' || severity === 'high' || severity === 'red') {
                    levelText = LEVEL_TEXT.red;
                    levelColor = LEVEL_COLOR.red;
                  } else if (severity === '中' || severity === 'medium' || severity === 'yellow') {
                    levelText = LEVEL_TEXT.yellow;
                    levelColor = LEVEL_COLOR.yellow;
                  } else {
                    levelText = LEVEL_TEXT.green;
                    levelColor = LEVEL_COLOR.green;
                  }
                }
                
                let actionText = a.action || a.suggestion || '';
                if (!actionText || typeof actionText !== 'string' || !actionText.trim()) {
                  if (levelText === '待加强') {
                    actionText = `重点补强${kpName}，建议每天做8-10道基础变式题`;
                  } else if (levelText === '基本掌握') {
                    actionText = `巩固${kpName}，建议每天做5-8道练习题`;
                  } else {
                    actionText = `保持${kpName}的良好状态，建议每天做3-5道综合题`;
                  }
                } else {
                  actionText = replaceKpCodesInText(actionText);
                }
                
                return (
                  <li key={i} className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{kpName}</span>
                      <span className={`text-xs font-medium ${levelColor}`}>{levelText}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      💡 {actionText}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {/* 诊断综述 */}
        {hasNarrative && (
          <Section title="诊断综述">
            <p className="text-sm text-gray-700 leading-relaxed">
              {replaceKpCodesInText(draft.narrative_text || '')}
            </p>
          </Section>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 px-4 py-3 shadow-sm">
      <h2 className="text-sm font-bold text-gray-800 mb-2">{title}</h2>
      {children}
    </section>
  );
}

function EmptyReport({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-2">
        <div className="text-5xl">📋</div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
