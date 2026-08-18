/**
 * domain/engine/reportBuilder.ts
 * Codex_04 规则引擎 - 报告组装（纯函数实现）
 *
 * 按 Codex_04 第 6.4 节 ReportDraft 接口组装诊断报告：
 * 汇总总分、自适应等级、模块掌握度、素养雷达、错因分布、四周计划、
 * 行动清单、置信标记、降级文案与叙述文本。
 * 所有函数无副作用，输入输出明确。
 */
import { RULES } from '../config/rules';
import {
  calcKpMastery,
  calcConfidence,
  finalLevel,
  MasteryLevel,
  Confidence,
} from './mastery';
import { calcEcProfile, EcProfile } from './ecProfile';
import {
  findRootCause,
  topoSort,
  buildPlan4Week,
  WeekPlan,
  KpDep,
  MethodCard,
  PathQuestion,
} from './pathEngine';
import { checkCredibility } from './credibility';

// ===== 类型定义 =====
export interface ReportSession {
  id: string;
}

export interface ReportRecord {
  question_id: string;
  kp_code?: string | null;
  module?: string;
  literacy?: string;
  pairing_id?: string | null;
  is_correct: boolean;
  score?: number;
  time_spent_ms: number;
  modify_count: number;
  self_mark?: string | null;
  invalid_input?: boolean;
  behavior_tag?: string | null;
  probe_result?: string | null;
  ec_code?: string | null;
}

export interface ReportQuestion {
  id: string;
  kp_code?: string | null;
  module?: string;
  literacy?: string;
  expected_time_sec: number;
  difficulty_est?: number;
  parallel_group_id?: string | null;
  variant_of?: string | null;
  status?: string;
  is_anchor?: boolean;
  is_warmup?: boolean;
}

export interface ModuleMasteryEntry {
  mastery_score: number;
  level: MasteryLevel;
  confidence: Confidence;
}

export interface ModuleMastery {
  [kpCode: string]: ModuleMasteryEntry;
}

export interface LiteracyRadar {
  [dimension: string]: { score: number; level: MasteryLevel };
}

export interface ActionItem {
  kp_code: string;
  level: MasteryLevel;
  ec_code?: string;
  action: string;
}

export interface ConfidenceFlag {
  question_id: string;
  flag: string;
}

export interface DegradedText {
  key: string;
  text: string;
}

export interface ReportDraft {
  student_id: string;
  total_score: number;
  adaptive_level: 'pass' | 'basic' | 'weak';
  module_mastery: ModuleMastery;
  literacy_radar: LiteracyRadar;
  ec_profile: EcProfile;
  plan_4week: WeekPlan[];
  action_checklist: ActionItem[];
  confidence_flags: ConfidenceFlag[];
  degraded_texts: DegradedText[];
  narrative_text: string;
}

// ===== 知识点中文名称映射（从三个题库种子文件提取，覆盖初一/初二/初三） =====
// 与 app/report/page.tsx 和 pipeline.ts 的 KP_NAME_MAP 保持一致！
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
  'KP-01.01': '正负数与有理数概念',
  'KP-01.02': '数轴与绝对值',

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
  'KP-04.1': '单项式',
  'KP-04.2': '同类项',
  'KP-04.01': '一元一次方程',
  'KP-04.02': '一元一次不等式',
  'KP-04.03': '含参方程与不等式',
  'KP-05.1': '等式性质',

  // ===== 初二（S3-01 身份） =====
  'KP-06.01': '二元一次方程组概念',
  'KP-06.02': '代入消元法',
  'KP-06.03': '加减消元法',
  'KP-06.04': '方程组应用',
  'KP-06.05': '方程组整数解',
  'KP-07.01': '不等式概念',
  'KP-07.02': '不等式解法',
  'KP-07.03': '不等式组',
  'KP-07.04': '不等式应用',
  'KP-07.05': '含参不等式组',
  'KP-07.06': '不等式组整数解',
  'KP-07.07': '不等式与角平分线综合',
  'KP-08.01': '变量与函数',
  'KP-08.02': '一次函数',
  'KP-08.03': '函数图象',
  'KP-08.04': '函数性质',
  'KP-09.01': '整式乘法',
  'KP-09.02': '乘法公式',
  'KP-09.03': '因式分解',
  'KP-09.04': '因式分解综合技巧',
  'KP-09.05': '因式分解应用',
  'KP-09.06': '十字相乘法',
  'KP-10.01': '分式概念',
  'KP-10.02': '分式运算',
  'KP-10.03': '分式方程',
  'KP-10.04': '分式化简求值',
  'KP-10.05': '三角形角度计算综合',
  'KP-11.01': '平行线判定',
  'KP-11.02': '平行线性质',
  'KP-11.03': '平行线综合应用',
  'KP-11.04': '含参不等式组',
  'KP-12.01': '全等三角形判定',
  'KP-12.02': '全等三角形性质',
  'KP-12.03': '角平分线与全等',
  'KP-12.04': '全等三角形证明',
  'KP-13.01': '三角形基本概念',
  'KP-13.02': '三角形边角关系',
  'KP-13.03': '全等三角形综合证明',
  'KP-13.04': '全等三角形判定与性质综合',
  'KP-14.01': '三角形三边关系',
  'KP-14.02': '三角形中线与高',
  'KP-14.03': '三角形内角与外角',
  'KP-14.04': '多边形内角和',

  // ===== 初三（S6-01 身份）—— 全量覆盖所有知识点 =====
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
};

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

// 行为标签中文描述
const BEHAVIOR_DESC: Record<string, string> = {
  'fast_correct': '快速正确（可能掌握较好或存在猜测）',
  'slow_correct': '思考充分后答对（稳定掌握）',
  'hesitant_correct': '犹豫后答对（伪掌握，需巩固）',
  'fast_wrong': '快速答错（概念不清或猜测错误）',
  'slow_wrong': '思考后答错（方法有误）',
  'hesitant_wrong': '犹豫后答错（知识模糊）',
  'abandoned': '放弃作答',
  'quick_guess': '秒选（可能存在猜测）',
  'revised_correct': '修改后答对（初步有误，最终纠正）',
  'revised_wrong': '修改后仍错（知识点缺失）',
};

function getKpName(kpCode: string): string {
  return KP_NAME_MAP[kpCode] || kpCode;
}

function getEcDesc(ecCode: string): string {
  return EC_DESC[ecCode] || ecCode;
}

function getLiteracyDesc(litCode: string): string {
  return LITERACY_DESC[litCode] || litCode;
}

function getBehaviorDesc(tag: string): string {
  return BEHAVIOR_DESC[tag] || tag;
}

function levelFromRatio(ratio: number): MasteryLevel {
  if (ratio >= RULES.MASTERY_GREEN) return 'green';
  if (ratio >= RULES.MASTERY_YELLOW) return 'yellow';
  return 'red';
}

function levelDesc(level: MasteryLevel): string {
  switch (level) {
    case 'green': return '掌握良好';
    case 'yellow': return '基本掌握';
    case 'red': return '待加强';
    default: return '待评估';
  }
}

// ===== 报告组装 =====
/**
 * buildReport - 组装 ReportDraft
 * 
 * 【判定逻辑设计 - MBTI式维度加权模型】
 * 参考MBTI人格测试的统计判定原理：
 * 1. 每个维度独立判定：每个素养维度/知识点需要 ≥N道有效题才能输出结论（N=2，否则置信度不足）
 * 2. 加权投票而非简单平均：不同难度题对得分贡献不同
 * 3. 一致性校验：配对题(pairing_id)的答案一致性会影响置信度
 * 4. 空白作答识别：有效作答率 <20% 时，判定为空白答卷，不输出任何评估，仅显示提示
 * 5. 维度置信度阈值：某维度数据不足时，显示为"暂无数据"而不是强行给个低分
 */
export function buildReport(
  studentId: string,
  sessions: ReportSession[],
  records: ReportRecord[],
  questions: ReportQuestion[],
  kpDeps: Map<string, KpDep>,
  methodCards: MethodCard[],
): ReportDraft {
  const recs = Array.isArray(records) ? records : [];
  const qs = Array.isArray(questions) ? questions : [];
  const qMap = new Map<string, ReportQuestion>(qs.map((q) => [q.id, q]));

  // ========== 第一阶段：有效作答检测（MBTI式严格样本校验） ==========
  // 过滤掉热身题的记录（不计入正式评估）
  const formalQs = qs.filter((q) => !q.is_warmup);
  const formalRecs = recs.filter((r) => {
    const q = qMap.get(r.question_id);
    return !q?.is_warmup;
  });

  /**
   * 🔴【真实有效作答判定函数 - 解决核心bug】
   * 原bug：学生每题都点提交但全部留空（score=0,is_correct=false），
   * 记录依然被算入"有效作答"，导致空白答卷被误判为"全部做错"，
   * 从而错误生成雷达图和模块掌握度。
   * 
   * MBTI式样本准入原则：
   * - 真正的"有效作答"必须满足以下任一条件之一，否则视为"未作答/白卷"：
   *   a) 得分 > 0（真的做对了部分或全部）
   *   b) 有作答修改痕迹(modify_count > 0) —— 说明动手了
   *   c) 投入了思考时间(time_spent_ms ≥ 15秒) —— 排除秒跳过
   *   d) 有标记(self_mark非空) 或 behavior_tag 不是 abandoned/quick_guess
   *   e) invalid_input为true（至少尝试了输入内容）
   */
  function isGenuineResponse(r: ReportRecord): boolean {
    // a) 得分>0 或 is_correct=true
    if (r.is_correct === true) return true;
    if (typeof r.score === 'number' && r.score > 0) return true;
    // b) 修改次数>0（至少动过输入框）
    if (r.modify_count && r.modify_count > 0) return true;
    // c) 每题至少投入15秒（排除秒跳过）
    if (r.time_spent_ms && r.time_spent_ms >= 15 * 1000) return true;
    // d) 有自我标记或有行为信号
    if (r.self_mark && r.self_mark !== '') return true;
    if (r.behavior_tag && !['abandoned', 'quick_guess', ''].includes(r.behavior_tag)) return true;
    // e) 输入无效（至少尝试输入了）
    if (r.invalid_input === true) return true;
    return false;
  }

  // ===== MBTI 阈值常量（集中定义便于调参） =====
  // 参考MBTI：每维度至少3题、问卷完成率≥80%才出可信人格类型
  const MIN_GENUINE_PER_DIMENSION = 2;       // 每个素养/知识点维度至少2题真实作答
  const GENUINE_RESPONSE_RATIO_THRESHOLD = 0.25; // 真实作答率<25%视为空白卷（比之前更严格）
  const ABANDONED_RATIO_CRITICAL = 0.5;      // abandoned行为超过50%判定为无效卷
  const MIN_TOTAL_GENUINE_FOR_RADAR = 4;     // 真实作答<4题不生成雷达图

  // 🔴 只保留"真实作答"的记录，排除全部空提交的伪记录
  const genuineFormalRecs = formalRecs.filter(isGenuineResponse);

  // 空白作答/放弃行为统计
  const abandonedCount = formalRecs.filter(r => r.behavior_tag === 'abandoned').length;
  const abandonedRatio = formalQs.length > 0 ? abandonedCount / formalQs.length : 0;
  const genuineRatio = formalQs.length > 0 ? genuineFormalRecs.length / formalQs.length : 0;

  // 🔴 关键判断：是否为无效/空白答卷（三重判定逻辑）
  const isBlankOrInvalidResponse = (
    formalQs.length === 0 ||
    genuineFormalRecs.length === 0 ||
    genuineRatio < GENUINE_RESPONSE_RATIO_THRESHOLD ||
    (formalRecs.length === 0 && formalQs.length > 0) ||  // 连提交记录都没有
    abandonedRatio >= ABANDONED_RATIO_CRITICAL        // 过半题直接放弃
  );

  // ========== 第二阶段：基础统计 ==========
  // 总分（只计正式真实有效题）
  const totalScore = genuineFormalRecs.reduce(
    (s, r) => s + (typeof r.score === 'number' ? r.score : r.is_correct ? 1 : 0),
    0,
  );

  // ========== 第三阶段：空白/无效答卷快速返回 ==========
  if (isBlankOrInvalidResponse) {
    // 生成详细的空白原因描述
    const blankReasons: string[] = [];
    if (formalQs.length === 0) blankReasons.push('题库未配置正式题');
    if (genuineFormalRecs.length === 0 && formalQs.length > 0) {
      blankReasons.push(`三天${formalQs.length}道正式题均无真实作答记录（全部空提交或秒跳过）`);
    }
    if (genuineRatio < GENUINE_RESPONSE_RATIO_THRESHOLD && genuineFormalRecs.length > 0) {
      blankReasons.push(`真实作答率仅${Math.round(genuineRatio*100)}%（${genuineFormalRecs.length}/${formalQs.length}道），低于有效诊断所需${GENUINE_RESPONSE_RATIO_THRESHOLD*100}%的门槛`);
    }
    if (abandonedRatio >= ABANDONED_RATIO_CRITICAL) {
      blankReasons.push(`放弃作答题占比过高（${Math.round(abandonedRatio*100)}%，${abandonedCount}/${formalQs.length}道），答卷无效`);
    }
    const reasonText = blankReasons.length > 0 ? blankReasons.join('；') : '作答样本不足';

    return {
      student_id: studentId,
      total_score: 0,
      adaptive_level: 'weak',
      module_mastery: {}, // 🔴 空白 —— 不输出任何模块掌握
      literacy_radar: {}, // 🔴 空白雷达图 —— 不输出任何素养维度
      ec_profile: { primary: null, secondary: null, distribution: {}, low_confidence_notes: ['有效作答不足，无法进行错因分析，请认真完成测评后重试'] },
      plan_4week: [], // 🔴 不输出4周计划
      action_checklist: [], // 🔴 不输出行动清单
      confidence_flags: [],
      degraded_texts: [
        { key: 'blank_response', text: `⚠️【无效答卷警告】本次诊断未生成有效评估。原因：${reasonText}。\n\n⚡ 诊断系统为什么空白？本系统参考MBTI人格测试原理，采用「多维样本+置信度校验」算法：每个能力维度需要至少${MIN_GENUINE_PER_DIMENSION}道真实作答题目、整体真实作答率≥${GENUINE_RESPONSE_RATIO_THRESHOLD*100}%才能形成可靠画像。空答卷就像"MBTI问卷全部不填"，无法判断任何能力倾向，因此雷达图、模块掌握度、4周计划均为空白。\n\n📌 建议操作：① 重新完成三天测评，每题认真作答不要留空；② 不要快速跳过题目（每题至少思考15秒）；③ 即使不会也尝试填写（至少表明思考过程），系统能识别"尝试但做错"与"完全不做"的区别。` }
      ],
      narrative_text: `【诊断报告 · 无效答卷】\n\n` +
        `本次三天诊断共配置 ${formalQs.length} 道正式测评题，系统检测到真实有效作答不足。\n\n` +
        `📊 作答情况统计：\n` +
        `· 总正式题数：${formalQs.length} 道\n` +
        `· 真实作答数：${genuineFormalRecs.length} 道\n` +
        `· 真实作答率：${Math.round(genuineRatio * 100)}%（诊断门槛需 ${GENUINE_RESPONSE_RATIO_THRESHOLD*100}%）\n` +
        `· 放弃作答数：${abandonedCount} 道（占比 ${Math.round(abandonedRatio*100)}%）\n\n` +
        `🧮 为什么空白？算法原理（参考MBTI 16型人格的判定逻辑）：\n` +
        `MBTI通过每维度至少3道题的作答投票判定人格类型（如E/I维度需≥3题E > ≥3题I才判定为E）。\n` +
        `本数学诊断同理：每个素养维度（知识理解/运算能力/推理能力等）需要至少${MIN_GENUINE_PER_DIMENSION}道真实作答作为投票样本，` +
        `样本不足时系统选择「不输出结论」而非「强行给低分」，这是为了避免对学生能力产生误判和标签化。\n\n` +
        `🎯 重新测评请遵循：\n` +
        `· 每道题即使不会也尝试填写（系统能区分"思考过但错了"和"完全空白"）\n` +
        `· 不要在每题<15秒内快速跳过\n` +
        `· 完成三天所有题目后再查看报告\n\n` +
        `空答卷 ≠ 能力差，只是数据不足无法评估。认真完成后再次生成即可获得完整诊断报告！`,
    };
  }

  // ========== 第四阶段：正式评估（基于真实作答数据） ==========
  // 到这里可保证 genuineFormalRecs.length >= GENUINE_RATIO_THRESHOLD * formalQs.length >= 1
  const denom = genuineFormalRecs.length || 1;
  const pct = (totalScore / denom) * 100;
  const adaptiveLevel: ReportDraft['adaptive_level'] =
    pct >= RULES.ADAPT_PASS_SCORE ? 'pass' : pct >= RULES.ADAPT_BASIC_SCORE ? 'basic' : 'weak';

  // ========== 4.1 模块掌握度（MBTI式：每维度独立判定置信度+样本数过滤） ==========
  const byKp = new Map<string, ReportRecord[]>();
  for (const r of genuineFormalRecs) {
    const q = qMap.get(r.question_id);
    const kp = r.kp_code ?? q?.kp_code ?? 'unknown';
    if (kp === 'unknown') continue;
    if (!byKp.has(kp)) byKp.set(kp, []);
    byKp.get(kp)!.push(r);
  }
  const moduleMastery: ModuleMastery = {};
  const masteryMap = new Map<string, number>();
  for (const [kp, kpRecs] of byKp) {
    // MBTI式：每知识点/维度 >= MIN_GENUINE_PER_DIMENSION 道真实题才输出
    // 样本不足不纳入计算（保证结论置信度）
    if (kpRecs.length < MIN_GENUINE_PER_DIMENSION) continue;
    const m = calcKpMastery(kpRecs);
    const pc = calcConfidence(kpRecs);
    const combined = finalLevel(m.level, pc.level);
    const safeScore = Number.isFinite(m.mastery_score) ? m.mastery_score : 0;
    moduleMastery[kp] = {
      mastery_score: safeScore,
      level: combined,
      confidence: m.confidence,
    };
    masteryMap.set(kp, safeScore);
  }

  // ========== 4.2 素养雷达（MBTI式：样本数过滤+贝叶斯修正+总量门槛） ==========
  const literacyRadar: LiteracyRadar = {};
  // 🔴 新增：真实作答<4题直接不生成雷达图（防止3题以内极端值导致画像失真）
  if (genuineFormalRecs.length >= MIN_TOTAL_GENUINE_FOR_RADAR) {
    const byLit = new Map<string, ReportRecord[]>();
    for (const r of genuineFormalRecs) {
      const q = qMap.get(r.question_id);
      const lit = r.literacy ?? q?.literacy ?? '';
      if (!lit || lit === 'default') continue;
      if (!LITERACY_DESC[lit]) continue;
      if (!byLit.has(lit)) byLit.set(lit, []);
      byLit.get(lit)!.push(r);
    }
    for (const [lit, litRecs] of byLit) {
      // MBTI式：每个素养维度至少MIN_GENUINE_PER_DIMENSION道真实题才输出
      if (litRecs.length < MIN_GENUINE_PER_DIMENSION) continue;
      const correct = litRecs.filter((r) => r.is_correct).length;
      const ratio = litRecs.length > 0 ? correct / litRecs.length : 0;
      // 贝叶斯先验修正：样本越少先验权重越大，避免1/1=100%造成虚高
      // 拉普拉斯平滑变体：score = (correct + α) / (total + 2α)，α取1-2
      const BAYES_ALPHA = litRecs.length <= 2 ? 2 : litRecs.length <= 4 ? 1.5 : 1;
      const bayesianScore = (correct + BAYES_ALPHA) / (litRecs.length + 2 * BAYES_ALPHA);
      // 题数≥5用原始比例，题数少用贝叶斯修正
      const finalScore = litRecs.length >= 5 ? ratio : bayesianScore;
      literacyRadar[lit] = {
        score: finalScore,
        level: levelFromRatio(finalScore)
      };
    }
  }
  // 若最终素养维度<2，则不展示雷达图（维度太少无法构成多边形，参考MBTI至少4维度）
  if (Object.keys(literacyRadar).length < 2) {
    // 清空radar（由page.tsx展示"暂无素养数据"）
    for (const k of Object.keys(literacyRadar)) delete literacyRadar[k];
  }

  // ========== 4.3 错因分布（错题且样本≥2才置信） ==========
  const errorRecs = genuineFormalRecs.filter((r) => !r.is_correct);
  const ecProfile = calcEcProfile(errorRecs);
  if (errorRecs.length < 2) {
    ecProfile.low_confidence_notes = [
      ...(ecProfile.low_confidence_notes ?? []),
      `错题样本不足（仅${errorRecs.length}道），错因分析置信度低，仅供参考`
    ];
  }

  // ========== 4.4 四周计划（仅在有数据时生成） ==========
  const weakKps = Object.entries(moduleMastery)
    .filter(([, v]) => v.level !== 'green')
    .map(([k]) => k);

  const wrongCountByKp = new Map<string, number>();
  const totalQuestionsByKp = new Map<string, number>();
  for (const r of genuineFormalRecs) {
    const q = qMap.get(r.question_id);
    const kp = r.kp_code ?? q?.kp_code ?? 'unknown';
    if (kp === 'unknown') continue;
    totalQuestionsByKp.set(kp, (totalQuestionsByKp.get(kp) ?? 0) + 1);
    if (!r.is_correct) {
      wrongCountByKp.set(kp, (wrongCountByKp.get(kp) ?? 0) + 1);
    }
  }

  let plan4WeekEnhanced: any[] = [];
  if (weakKps.length > 0 || masteryMap.size > 0) {
    const rootKps = weakKps.map((kp) => findRootCause(kp, kpDeps, masteryMap));
    const sortedKps = topoSort(rootKps, kpDeps);
    const pathQuestions: PathQuestion[] = qs.map((q) => ({
      id: q.id,
      kp_code: q.kp_code,
      variant_of: q.variant_of,
      status: q.status,
      difficulty_est: q.difficulty_est,
    }));
    const plan4Week = buildPlan4Week(sortedKps, methodCards, pathQuestions);

    plan4WeekEnhanced = plan4Week.map((week, idx) => {
      const focusKps = week.focus_kps && week.focus_kps.length > 0 
        ? week.focus_kps.filter(kp => kp !== '综合复习')
        : [];
      
      const weeklyContent: string[] = [];
      const focusKpNames: string[] = [];
      
      for (const kp of focusKps) {
        const kpName = getKpName(kp);
        focusKpNames.push(kpName);
        const wrongCount = wrongCountByKp.get(kp) ?? 0;
        const totalCount = totalQuestionsByKp.get(kp) ?? 0;
        const accuracy = totalCount > 0 ? Math.round((1 - wrongCount / totalCount) * 100) : 0;
        
        if (wrongCount > 0) {
          weeklyContent.push(`📖 ${kpName}（正确率${accuracy}%，错题${wrongCount}/${totalCount}道）：第1-2天回归课本概念，第3-4天重做错题并标注错因，第5-7天做5道同类变式题（难度循序渐进）`);
        } else if (totalCount > 0) {
          weeklyContent.push(`✅ ${kpName}（正确率${accuracy}%）：本周选做3道综合拓展题，保持手感`);
        } else {
          weeklyContent.push(`📚 ${kpName}：本周从基础题开始，系统复习并做5道入门题`);
        }
      }

      if (focusKps.length === 0) {
        if (idx === 0) {
          weeklyContent.push('📖 第一周重点：全面梳理本月已学章节知识点框架，建立知识图谱，标记不熟悉的概念');
        } else if (idx === 1) {
          weeklyContent.push('⚡ 第二周重点：针对不熟悉的概念进行专项刷题训练，每类题做3道并总结规律');
        } else if (idx === 2) {
          weeklyContent.push('🔗 第三周重点：综合应用题训练，尝试跨章节的综合题，培养知识迁移能力');
        } else {
          weeklyContent.push('🎯 第四周重点：限时模拟测试，训练考试节奏和时间管理，查漏补缺');
        }
      }
      
      return {
        week: week.week ?? (idx + 1),
        focus_kps: focusKpNames.length > 0 ? focusKpNames : ['综合巩固'],
        practice_count: week.practice_count ?? (idx === 0 ? 3 : 5),
        weekly_content: weeklyContent,
        description: `第${idx + 1}周：${focusKpNames.length > 0 ? '重点突破 ' + focusKpNames.slice(0, 3).join('、') : '综合提升'}`,
      };
    });
  }

  // ========== 4.5 行动清单（基于真实答题数据生成具体建议） ==========
  const actionChecklist: ActionItem[] = [];
  const wrongKps = new Map<string, { count: number; ecCodes: string[]; questions: number[]; correct_count: number }>();

  for (const r of genuineFormalRecs) {
    const q = qMap.get(r.question_id);
    const kp = r.kp_code ?? q?.kp_code ?? null;
    if (!kp || kp === 'unknown') continue;
    if (!wrongKps.has(kp)) {
      wrongKps.set(kp, { count: 0, ecCodes: [], questions: [], correct_count: 0 });
    }
    const entry = wrongKps.get(kp)!;
    if (r.is_correct) {
      entry.correct_count++;
    } else {
      entry.count++;
      entry.questions.push(Number(r.question_id) || 0);
      if (r.ec_code) entry.ecCodes.push(r.ec_code);
    }
  }

  const sortedWrongKps = [...wrongKps.entries()]
    .filter(([, info]) => info.count > 0)
    .sort((a, b) => b[1].count - a[1].count);

  for (const [kp, info] of sortedWrongKps.slice(0, 8)) {
    const masterLevel = moduleMastery[kp]?.level ?? 'red';
    const kpName = getKpName(kp);
    const uniqueEcs = [...new Set(info.ecCodes)];
    const ecDescs = uniqueEcs.map(c => getEcDesc(c));
    const ecDesc = ecDescs.length > 0
      ? `【错因：${ecDescs.slice(0, 2).join('+')}】`
      : '';
    const total = info.count + info.correct_count;
    const accuracy = total > 0 ? Math.round((info.correct_count / total) * 100) : 0;

    const questionListStr = info.questions.length > 0
      ? `（错题：第${info.questions.slice(0, 4).join('、')}题）`
      : '';

    if (masterLevel === 'red' || accuracy <= 40) {
      actionChecklist.push({
        kp_code: kp,
        level: 'red',
        ec_code: uniqueEcs[0] ?? undefined,
        action: `🔴【紧急补强】${kpName}${questionListStr} 正确率仅${accuracy}% ${ecDesc}\n    立即行动：①精读教材对应章节，画思维导图梳理概念；②逐题重做错题并写下每一步理由；③从基础题开始，连做10道同类题直到连续3题全对；④整理错题本，写下易错陷阱`,
      });
    } else if (masterLevel === 'yellow' || accuracy <= 70) {
      actionChecklist.push({
        kp_code: kp,
        level: 'yellow',
        ec_code: uniqueEcs[0] ?? undefined,
        action: `🟡【巩固提升】${kpName}${questionListStr} 正确率${accuracy}% ${ecDesc}\n    立即行动：①分析错题错因，归类为"概念/方法/计算失误"；②选做3道变式题（换数字不换类型）；③与已掌握的类似考点做对比，找出规律差异`,
      });
    } else {
      actionChecklist.push({
        kp_code: kp,
        level: 'green',
        ec_code: uniqueEcs[0] ?? undefined,
        action: `🟢【查漏补缺】${kpName}${questionListStr} 正确率${accuracy}% 虽有小错但整体掌握：①做1道综合拓展应用题挑战自己；②向同学讲解该考点检验真正掌握程度`,
      });
    }
  }

  // 绿区拓展项（最多2个，避免清单过长）
  if (actionChecklist.length <= 5) {
    const topGreenKps = Object.entries(moduleMastery)
      .filter(([, v]) => v.level === 'green')
      .slice(0, 2);
    for (const [kp, info] of topGreenKps) {
      const kpName = getKpName(kp);
      actionChecklist.push({
        kp_code: kp,
        level: 'green',
        action: `🟢【拓展挑战】${kpName} 掌握良好！进阶：①尝试本考点L3/L4难度综合题；②结合生活实际，自己编1道应用题并求解；③帮助同桌/同学解答本考点的疑问`,
      });
    }
  }

  // ========== 4.6 置信标记 ==========
  const confidenceFlags: ConfidenceFlag[] = [];
  for (const r of genuineFormalRecs) {
    if (r.behavior_tag === 'hesitant_correct') {
      confidenceFlags.push({ question_id: r.question_id, flag: '伪掌握：犹豫后修正答对' });
    }
    if (r.probe_result === 'confirmed_guess') {
      confidenceFlags.push({ question_id: r.question_id, flag: '疑似猜对' });
    }
    if (r.behavior_tag === 'abandoned') {
      confidenceFlags.push({ question_id: r.question_id, flag: '中途放弃' });
    }
    if (r.behavior_tag === 'quick_guess' && !r.is_correct) {
      confidenceFlags.push({ question_id: r.question_id, flag: '秒选答错' });
    }
  }

  // ========== 4.7 低信度 / 降级文案 ==========
  const credibility = checkCredibility(sessions, genuineFormalRecs, qs);
  const degradedTexts: DegradedText[] = [];
  if (credibility.is_low_credibility) {
    degradedTexts.push({
      key: 'credibility',
      text: '⚠️ 本次答卷存在低信度信号(' + credibility.signals.join('、') + ')，存在猜测或仓促作答迹象，以下结论仅供参考，建议重新认真完成测评。',
    });
  }
  if (formalRecs.length * 2 < formalQs.length) {
    degradedTexts.push({
      key: 'incomplete',
      text: `ℹ️ 部分题目未作答（已完成${formalRecs.length}/${formalQs.length}），评估结果可能存在偏差，完成全部题目可获得更精准诊断。`,
    });
  }

  // ========== 4.8 叙述文本（基于真实数据生成专业分析）==========
  const greenCount = Object.values(moduleMastery).filter((v) => v.level === 'green').length;
  const yellowCount = Object.values(moduleMastery).filter((v) => v.level === 'yellow').length;
  const redCount = Object.values(moduleMastery).filter((v) => v.level === 'red').length;
  const totalKps = greenCount + yellowCount + redCount;

  const totalAnswered = genuineFormalRecs.length;
  const correctCount = genuineFormalRecs.filter((r) => r.is_correct).length;
  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
  const avgTimeSec = totalAnswered > 0
    ? Math.round(genuineFormalRecs.reduce((s, r) => s + (r.time_spent_ms ?? 0), 0) / totalAnswered / 1000)
    : 0;

  let narrative = '';
  narrative += `📊 三天诊断数据概览：\n`;
  narrative += `本次共作答 ${qs.length} 道题（热身题 ${qs.filter(q => q.is_warmup).length} 道，正式计分题 ${formalQs.length} 道）。\n`;
  narrative += `有效作答 ${totalAnswered} 道，答对 ${correctCount} 道，正确率 ${accuracy}%。\n`;
  narrative += `总得分 ${totalScore} 分，平均每题用时约 ${avgTimeSec} 秒。\n\n`;

  // 等级判定 + 解释
  const levelLabel = adaptiveLevel === 'pass' ? '✅ 达标' : adaptiveLevel === 'basic' ? '🟡 基本达标' : '🔴 待加强';
  const levelDescFull = {
    pass: `你的正确率超过 ${RULES.ADAPT_PASS_SCORE}%，整体表现优秀，大部分知识点已扎实掌握。可将精力放在综合能力提升和拓展挑战上，不必重复刷基础题。`,
    basic: `你的正确率在 ${RULES.ADAPT_BASIC_SCORE}-${RULES.ADAPT_PASS_SCORE}% 区间，属于基本达标。当前最大的提分空间在于消灭"基本掌握"类的薄弱考点——这类题最容易通过针对性训练在短时间内突破。建议优先攻克黄色掌握度的知识点。`,
    weak: `你的正确率低于 ${RULES.ADAPT_BASIC_SCORE}%，存在较多系统性薄弱环节。请不要气馁——通过科学规划的4周训练完全可以实现弯道超车。**本周最重要的事：先从红区知识点（正确率<50%）开始，逐个突破，不要贪多求快。**`,
  };
  narrative += `🎯 综合评定：${levelLabel}\n${levelDescFull[adaptiveLevel]}\n\n`;

  // 掌握度饼图文字版
  if (totalKps > 0) {
    narrative += `📚 知识点掌握图谱（本次覆盖 ${totalKps} 个考点）：\n`;
    
    if (redCount > 0) {
      const redKpNames = Object.entries(moduleMastery)
        .filter(([, v]) => v.level === 'red')
        .map(([k, v]) => {
          const kpName = getKpName(k);
          const total = (totalQuestionsByKp.get(k) ?? 0);
          const wrong = wrongCountByKp.get(k) ?? 0;
          const acc = total > 0 ? Math.round((1 - wrong/total)*100) : 0;
          return `${kpName}(${acc}%)`;
        })
        .slice(0, 5);
      narrative += `· 🔴 待加强（${redCount}个，正确率≤50%）：${redKpNames.join('、')}。\n  → 这些是**本月最紧急补强项**，每攻克一个就能显著提升总分。\n`;
    }
    
    if (yellowCount > 0) {
      const yellowKpNames = Object.entries(moduleMastery)
        .filter(([, v]) => v.level === 'yellow')
        .map(([k, v]) => {
          const kpName = getKpName(k);
          const total = (totalQuestionsByKp.get(k) ?? 0);
          const wrong = wrongCountByKp.get(k) ?? 0;
          const acc = total > 0 ? Math.round((1 - wrong/total)*100) : 0;
          return `${kpName}(${acc}%)`;
        })
        .slice(0, 5);
      narrative += `· 🟡 基本掌握（${yellowCount}个，正确率50-80%）：${yellowKpNames.join('、')}。\n  → 这类考点最具"提分性价比"，只需少量针对性训练就能转为绿区。\n`;
    }
    
    if (greenCount > 0) {
      const greenKpNames = Object.entries(moduleMastery)
        .filter(([, v]) => v.level === 'green')
        .map(([k]) => getKpName(k))
        .slice(0, 5);
      narrative += `· 🟢 掌握良好（${greenCount}个，正确率>80%）：${greenKpNames.join('、')}。\n  → 保持优势，可挑战更高难度综合题。\n`;
    }
    narrative += '\n';
  }

  // 错因深度分析（如有）
  if (ecProfile.primary) {
    const primaryDesc = getEcDesc(ecProfile.primary);
    narrative += `🧩 错因归因分析：\n`;
    narrative += `你的首要错因是「${primaryDesc}」。\n`;
    
    const ecCountMap = new Map<string, number>();
    for (const r of genuineFormalRecs) {
      if (!r.is_correct && r.ec_code) {
        ecCountMap.set(r.ec_code, (ecCountMap.get(r.ec_code) ?? 0) + 1);
      }
    }
    
    if (ecCountMap.size > 0) {
      const totalErrors = errorRecs.length;
      const topEcs = [...ecCountMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      
      narrative += `错误分布：`;
      narrative += topEcs.map(([code, count]) => 
        `${getEcDesc(code)} ${count}次(${totalErrors > 0 ? Math.round(count/totalErrors*100): 0}%)`
      ).join('；');
      narrative += '。\n\n';

      // 针对性训练建议
      if (ecProfile.primary === 'EC-K1' || ecProfile.primary === 'EC-K2') {
        narrative += `💡 训练方向：概念理解类错误 → 避免"看题秒做"，每道题先在草稿纸上写出"该题考什么？有什么陷阱？已知条件？"再下笔。做30题后回看，错误率通常能降30%。\n\n`;
      } else if (ecProfile.primary === 'EC-C3' || ecProfile.primary === 'EC-M2') {
        narrative += `💡 训练方向：计算失误类错误 → 每天10道基础计算限时训练（5分钟完成），坚持2周计算准确率提升90%。做计算题时严禁跳步，每一步写清楚。\n\n`;
      } else if (ecProfile.primary === 'EC-C1' || ecProfile.primary === 'EC-C2') {
        narrative += `💡 训练方向：审题/条件运用错误 → 读题时把关键数字和条件圈出来，读完题先问自己"求什么？给了什么？还差什么？"，三个问号回答清楚再动笔。\n\n`;
      } else if (ecProfile.primary === 'EC-C4' || ecProfile.primary === 'EC-M1') {
        narrative += `💡 训练方向：逻辑/方法问题 → 把"参考答案"的每一步遮住自己推，卡住的地方记下来并对照解析，建立完整的解题步骤链条。\n\n`;
      }
    }
  }

  // 行为分析（如有显著信号）
  const behaviorCountMap = new Map<string, number>();
  for (const r of genuineFormalRecs) {
    if (r.behavior_tag) {
      behaviorCountMap.set(r.behavior_tag, (behaviorCountMap.get(r.behavior_tag) ?? 0) + 1);
    }
  }
  
  if (behaviorCountMap.size > 0) {
    const totalByBehav = genuineFormalRecs.length;
    const quickWrongCount = behaviorCountMap.get('fast_wrong') ?? 0;
    const slowWrongCount = behaviorCountMap.get('slow_wrong') ?? 0;
    const abandonedCount = behaviorCountMap.get('abandoned') ?? 0;
    
    if (quickWrongCount / totalByBehav >= 0.2) {
      narrative += `⏱️ 作答行为提醒：有 ${quickWrongCount} 道题呈现"快速答错"特征（可能存在赶时间或读题过快）。建议：每题强制读2遍再作答，会做的题不丢分=免费提分。\n\n`;
    } else if (slowWrongCount / totalByBehav >= 0.2) {
      narrative += `⏱️ 作答行为提醒：有 ${slowWrongCount} 道题呈现"思考很久仍答错"特征（通常意味着方法选择错误或概念理解偏差）。建议：这类题一定要整理到错题本，逐步骤对照参考答案找出偏差点。\n\n`;
    } else if (abandonedCount >= 2) {
      narrative += `⏱️ 作答行为提醒：有 ${abandonedCount} 道题中途放弃。遇到难题不要慌，先写"能推到哪一步算哪一步"，阅卷按步骤给分；同时心态上接受"压轴题第2问放弃也无妨"，把时间留给中档题。\n\n`;
    }
  }

  // 素养维度分析（仅展示有数据的）
  const litEntries = Object.entries(literacyRadar);
  if (litEntries.length >= 2) {
    const litSorted = litEntries.sort((a, b) => b[1].score - a[1].score);
    const strongest = litSorted[0];
    const weakest = litSorted[litSorted.length - 1];
    
    narrative += `🧠 数学素养画像：\n`;
    narrative += `· ✨ 最强维度：${getLiteracyDesc(strongest[0])}（${Math.round(strongest[1].score * 100)}分）——这是你的能力长板，遇到难题可优先用该维度的思路切入。\n`;
    narrative += `· 📌 待发展：${getLiteracyDesc(weakest[0])}（${Math.round(weakest[1].score * 100)}分）——该维度直接关联多个易丢分题型，是接下来4周训练的核心突破口。\n\n`;
  }

  // 结尾寄语
  narrative += `\n🌟 最后寄语：\n`;
  if (adaptiveLevel === 'weak') {
    narrative += `本次测评暴露了一些薄弱点，**但这恰恰是提分的黄金机会**。每个红区知识点都是一个待挖的金矿——每攻克一个就能看到明确的分数增长。请从4周计划的第一周开始，每天专注30分钟，坚持就能看见蜕变。`;
  } else if (adaptiveLevel === 'basic') {
    narrative += `你已经具备了不错的基础，现在处于"临门一脚"的关键突破期。重点攻克黄区考点，每一道都可能在下次考试中变成实实在在的分数。坚持4周计划，"基本达标"转变为"稳定达标"指日可待！`;
  } else {
    narrative += `优秀的表现背后是扎实的积累。现在可以从"会做题"走向"会思考"：尝试给同学讲题、自己编题、挑战竞赛入门题，让数学思维从"熟练"升维到"精通"。`;
  }
  narrative += `\n\n💪 千里之行，始于足下。从今天的行动清单第一项开始吧！`;

  const finalNarrative = narrative.trim();

  return {
    student_id: studentId,
    total_score: totalScore,
    adaptive_level: adaptiveLevel,
    module_mastery: moduleMastery,
    literacy_radar: literacyRadar,
    ec_profile: ecProfile,
    plan_4week: plan4WeekEnhanced,
    action_checklist: actionChecklist,
    confidence_flags: confidenceFlags,
    degraded_texts: degradedTexts,
    narrative_text: finalNarrative,
  };
}