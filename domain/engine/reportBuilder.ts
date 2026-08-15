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

// ===== 知识点中文名称映射 =====
const KP_NAME_MAP: Record<string, string> = {
  'KP-01.1': '正负数概念',
  'KP-02.01': '有理数运算',
  'KP-02.02': '实数与无理数',
  'KP-03.01': '代数式与整式',
  'KP-03.02': '代入求值',
  'KP-04.01': '一元一次方程',
  'KP-04.02': '一元一次不等式',
  'KP-04.03': '含参方程',
  'KP-06.01': '二元一次方程组概念',
  'KP-06.02': '代入消元法',
  'KP-06.03': '加减消元法',
  'KP-06.04': '方程组应用题',
  'KP-06.05': '方程组整数解',
  'KP-07.01': '相交线与对顶角',
  'KP-07.02': '平行线判定',
  'KP-07.03': '平行线性质',
  'KP-07.04': '平移',
  'KP-07.05': '角平分线',
  'KP-07.06': '拐点问题',
  'KP-08.01': '幂的运算',
  'KP-08.02': '积的乘方',
  'KP-08.03': '乘法公式',
  'KP-08.04': '整式混合运算',
  'KP-09.01': '因式分解概念',
  'KP-09.02': '提公因式法',
  'KP-09.03': '公式法分解',
  'KP-09.04': '综合因式分解',
  'KP-09.05': '因式分解应用',
  'KP-09.06': '十字相乘法',
  'KP-10.01': '三角形三边关系',
  'KP-10.02': '三角形中线',
  'KP-10.03': '平行线分三角形',
  'KP-11.01': '不等式性质',
  'KP-11.02': '不等式解法',
  'KP-11.03': '不等式组应用',
  'KP-12.01': '分式有意义条件',
  'KP-12.02': '分式加减',
  'KP-12.03': '分式乘除',
  'KP-12.04': '分式方程',
  'KP-13.01': '全等三角形概念',
  'KP-13.02': '全等三角形判定',
  'KP-13.03': '全等三角形应用',
  'KP-23.01': '一元二次方程解法',
  'KP-23.02': '一元二次方程应用',
  'KP-P.1': '分数基本性质',
  'KP-P.2': '小数与分数互化',
  'KP-P.3': '钟表角度计算',
  'KP-P.4': '四则混合运算',
  'KP-P.5': '比例与比例尺',
  'KP-P.6': '正比例函数',
  'KP-P.7': '反比例函数',
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

  // 过滤掉热身题的记录（不计入正式评估）
  const formalRecs = recs.filter((r) => {
    const q = qMap.get(r.question_id);
    return !q?.is_warmup;
  });

  // 总分（只计正式题）
  const totalScore = formalRecs.reduce(
    (s, r) => s + (typeof r.score === 'number' ? r.score : r.is_correct ? 1 : 0),
    0,
  );

  // 自适应等级
  const formalQs = qs.filter((q) => !q.is_warmup);
  const denom = formalQs.length || 1;
  const pct = (totalScore / denom) * 100;
  const adaptiveLevel: ReportDraft['adaptive_level'] =
    pct >= RULES.ADAPT_PASS_SCORE ? 'pass' : pct >= RULES.ADAPT_BASIC_SCORE ? 'basic' : 'weak';

  // 模块掌握度（按 kp_code 聚合）
  const byKp = new Map<string, ReportRecord[]>();
  for (const r of recs) {
    const q = qMap.get(r.question_id);
    const kp = r.kp_code ?? q?.kp_code ?? 'unknown';
    if (!byKp.has(kp)) byKp.set(kp, []);
    byKp.get(kp)!.push(r);
  }
  const moduleMastery: ModuleMastery = {};
  const masteryMap = new Map<string, number>();
  for (const [kp, kpRecs] of byKp) {
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

  // 素养雷达（按 literacy 聚合）
  const literacyRadar: LiteracyRadar = {};
  const byLit = new Map<string, ReportRecord[]>();
  for (const r of recs) {
    const q = qMap.get(r.question_id);
    const lit = r.literacy ?? q?.literacy ?? 'default';
    if (!byLit.has(lit)) byLit.set(lit, []);
    byLit.get(lit)!.push(r);
  }
  for (const [lit, litRecs] of byLit) {
    const correct = litRecs.filter((r) => r.is_correct).length;
    const ratio = litRecs.length > 0 ? correct / litRecs.length : 0;
    literacyRadar[lit] = { score: ratio, level: levelFromRatio(ratio) };
  }

  // 错因分布（错题）
  const errorRecs = recs.filter((r) => !r.is_correct);
  const ecProfile = calcEcProfile(errorRecs);

  // 四周计划：薄弱 KP → 根因 → 拓扑排序 → 分阶段规划
  const weakKps = Object.entries(moduleMastery)
    .filter(([, v]) => v.level !== 'green')
    .map(([k]) => k);

  // 收集错题统计，用于生成个性化计划
  const wrongCountByKp = new Map<string, number>();
  const totalQuestionsByKp = new Map<string, number>();
  for (const r of recs) {
    const q = qMap.get(r.question_id);
    const kp = r.kp_code ?? q?.kp_code ?? 'unknown';
    totalQuestionsByKp.set(kp, (totalQuestionsByKp.get(kp) ?? 0) + 1);
    if (!r.is_correct) {
      wrongCountByKp.set(kp, (wrongCountByKp.get(kp) ?? 0) + 1);
    }
  }

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

  // 增强4周计划：添加具体内容描述和中文名称
  const plan4WeekEnhanced = plan4Week.map((week, idx) => {
    const focusKps = week.focus_kps && week.focus_kps.length > 0 
      ? week.focus_kps 
      : [(methodCards?.[idx]?.kp_codes ?? [])[0] || '综合复习'];
    
    // 为每周添加具体的练习数量和内容描述
    const weeklyContent: string[] = [];
    for (const kp of focusKps) {
      const kpName = getKpName(kp);
      const wrongCount = wrongCountByKp.get(kp) ?? 0;
      const totalCount = totalQuestionsByKp.get(kp) ?? 0;
      const accuracy = totalCount > 0 ? Math.round((1 - wrongCount / totalCount) * 100) : 0;
      
      if (wrongCount > 0) {
        weeklyContent.push(`${kpName}（正确率${accuracy}%，错题${wrongCount}道）：回顾概念→重做错题→变式练习`);
      }
    }
    
    const defaultContent = weeklyContent.length === 0 
      ? ['综合复习：巩固已掌握知识点，查漏补缺']
      : weeklyContent;
    
    return {
      ...week,
      focus_kps: focusKps,
      practice_count: week.practice_count ?? 5,
      weekly_content: defaultContent,
      description: `第${idx + 1}周重点：${focusKps.map(k => getKpName(k)).join('、')}`,
    };
  });

  // 行动清单（基于真实答题数据生成具体建议）
  const actionChecklist: ActionItem[] = [];

  // 收集错题对应的知识点和错因
  const wrongKps = new Map<string, { count: number; ecCodes: string[]; questions: number[] }>();
  for (const r of recs) {
    if (!r.is_correct) {
      const q = qMap.get(r.question_id);
      const kp = r.kp_code ?? q?.kp_code ?? null;
      if (kp && kp !== 'unknown') {
        if (!wrongKps.has(kp)) {
          wrongKps.set(kp, { count: 0, ecCodes: [], questions: [] });
        }
        const entry = wrongKps.get(kp)!;
        entry.count++;
        entry.questions.push(Number(r.question_id) || 0);
        if (r.ec_code) entry.ecCodes.push(r.ec_code);
      }
    }
  }

  // 按错误次数排序，生成针对性建议
  const sortedWrongKps = [...wrongKps.entries()].sort((a, b) => b[1].count - a[1].count);

  for (const [kp, info] of sortedWrongKps.slice(0, 10)) {
    const masterLevel = moduleMastery[kp]?.level ?? 'red';
    const kpName = getKpName(kp);
    const ecDescs = info.ecCodes.map(c => getEcDesc(c));
    const ecDesc = ecDescs.length > 0
      ? `（主要错因：${[...new Set(ecDescs)].slice(0, 2).join('、')}）`
      : '';
    const wrongRate = totalQuestionsByKp.get(kp) ?? 0;
    const accuracy = wrongRate > 0 ? Math.round((1 - info.count / wrongRate) * 100) : 0;

    if (masterLevel === 'red') {
      actionChecklist.push({
        kp_code: kp,
        level: masterLevel,
        ec_code: info.ecCodes[0] ?? undefined,
        action: `【重点补强】${kpName} ${ecDesc}：本考点正确率仅${accuracy}%，建议：①回归教材，重新理解核心概念；②重做本次错题（第${info.questions.slice(0, 3).join('、')}题）；③完成5道同类变式题；④总结解题步骤和易错点`,
      });
    } else if (masterLevel === 'yellow') {
      actionChecklist.push({
        kp_code: kp,
        level: masterLevel,
        ec_code: info.ecCodes[0] ?? undefined,
        action: `【巩固提升】${kpName} ${ecDesc}：本考点正确率${accuracy}%，建议：①排查本次错题的错误原因；②进行3道变式训练；③与已掌握的同类考点进行对比学习`,
      });
    }
  }

  // 添加掌握良好的知识点的拓展建议
  const greenKps = Object.entries(moduleMastery)
    .filter(([, v]) => v.level === 'green')
    .map(([k]) => k)
    .slice(0, 3);

  for (const kp of greenKps) {
    const kpName = getKpName(kp);
    const accuracy = totalQuestionsByKp.get(kp) ?? 0;
    actionChecklist.push({
      kp_code: kp,
      level: 'green',
      action: `【拓展提升】${kpName}：本考点掌握良好（正确率${accuracy > 0 ? Math.round((wrongKps.get(kp)?.count ?? 0 / accuracy) * 100) : 100}%），建议：①挑战更高难度题目；②尝试综合应用题；③帮助同学讲解相关知识点`,
    });
  }

  // 置信标记
  const confidenceFlags: ConfidenceFlag[] = [];
  for (const r of recs) {
    if (r.behavior_tag === 'hesitant_correct') {
      confidenceFlags.push({ question_id: r.question_id, flag: 'hesitant_correct(伪掌握)' });
    }
    if (r.probe_result === 'confirmed_guess') {
      confidenceFlags.push({ question_id: r.question_id, flag: 'confirmed_guess(疑似猜对)' });
    }
    if (r.behavior_tag === 'abandoned') {
      confidenceFlags.push({ question_id: r.question_id, flag: 'abandoned(中途放弃)' });
    }
  }

  // 低信度 / 降级文案
  const credibility = checkCredibility(sessions, recs, qs);
  const degradedTexts: DegradedText[] = [];
  if (credibility.is_low_credibility) {
    degradedTexts.push({
      key: 'credibility',
      text: '本次答卷存在低信度信号(' + credibility.signals.join(',') + ')，结论仅供参考，建议复测。',
    });
  }

  // ===== 叙述文本（基于真实数据生成专业分析）=====
  const greenCount = Object.values(moduleMastery).filter((v) => v.level === 'green').length;
  const yellowCount = Object.values(moduleMastery).filter((v) => v.level === 'yellow').length;
  const redCount = Object.values(moduleMastery).filter((v) => v.level === 'red').length;
  const totalKps = greenCount + yellowCount + redCount;

  // 计算正确率和时间数据
  const totalAnswered = recs.length;
  const correctCount = recs.filter((r) => r.is_correct).length;
  const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
  const avgTimeSec = totalAnswered > 0
    ? Math.round(recs.reduce((s, r) => s + (r.time_spent_ms ?? 0), 0) / totalAnswered / 1000)
    : 0;

  // 构建个性化叙述
  let narrative = '';

  // 基础数据
  narrative += `本次三天诊断共完成 ${qs.length} 道题目（其中热身题 ${qs.filter(q => q.is_warmup).length} 道），正式计分题 ${formalQs.length} 道。`;
  narrative += `总得分 ${totalScore} 分，正确率 ${accuracy}%，平均每题用时约 ${avgTimeSec} 秒。\n\n`;

  // 自适应等级分析
  const levelDesc_text = {
    pass: '综合表现优秀，已达到年级水平要求',
    basic: '基本达标，部分知识点需要巩固',
    weak: '存在明显薄弱环节，需要系统加强',
  };
  narrative += `综合评定为「${adaptiveLevel === 'pass' ? '达标' : adaptiveLevel === 'basic' ? '基本达标' : '待加强'}」，${levelDesc_text[adaptiveLevel]}。\n\n`;

  // 掌握度分析
  if (totalKps > 0) {
    narrative += `在本次诊断覆盖的 ${totalKps} 个知识点中：\n`;
    
    if (greenCount > 0) {
      const greenKpNames = Object.entries(moduleMastery)
        .filter(([, v]) => v.level === 'green')
        .map(([k]) => getKpName(k))
        .slice(0, 5);
      narrative += `· 掌握良好（${greenCount}个）：${greenKpNames.join('、')}等，正确率较高，可适当拓展提升。\n`;
    }
    
    if (yellowCount > 0) {
      const yellowKpNames = Object.entries(moduleMastery)
        .filter(([, v]) => v.level === 'yellow')
        .map(([k]) => getKpName(k))
        .slice(0, 5);
      narrative += `· 基本掌握（${yellowCount}个）：${yellowKpNames.join('、')}等，存在一定疏漏，需要巩固练习。\n`;
    }
    
    if (redCount > 0) {
      const redKpNames = Object.entries(moduleMastery)
        .filter(([, v]) => v.level === 'red')
        .map(([k]) => getKpName(k))
        .slice(0, 5);
      narrative += `· 待加强（${redCount}个）：${redKpNames.join('、')}等，错误率较高，需要重点补强。\n`;
    }
    narrative += '\n';
  }

  // 错因分析
  if (ecProfile.primary) {
    const primaryDesc = getEcDesc(ecProfile.primary);
    narrative += `主要错误类型为「${primaryDesc}」，`;
    
    // 统计各错因出现次数
    const ecCountMap = new Map<string, number>();
    for (const r of recs) {
      if (!r.is_correct && r.ec_code) {
        ecCountMap.set(r.ec_code, (ecCountMap.get(r.ec_code) ?? 0) + 1);
      }
    }
    
    if (ecCountMap.size > 0) {
      const topEcs = [...ecCountMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([code, count]) => `${getEcDesc(code)}(${count}次)`);
      narrative += `具体分布为：${topEcs.join('、')}。建议重点关注相应问题类型。\n\n`;
    }
  }

  // 行为分析
  const behaviorCountMap = new Map<string, number>();
  for (const r of recs) {
    if (r.behavior_tag) {
      behaviorCountMap.set(r.behavior_tag, (behaviorCountMap.get(r.behavior_tag) ?? 0) + 1);
    }
  }
  
  if (behaviorCountMap.size > 0) {
    const significantBehaviors = [...behaviorCountMap.entries()]
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    if (significantBehaviors.length > 0) {
      narrative += '作答行为分析：\n';
      for (const [tag, count] of significantBehaviors) {
        const desc = getBehaviorDesc(tag);
        if (desc !== tag) {
          narrative += `· ${desc}（${count}题）\n`;
        }
      }
      narrative += '\n';
    }
  }

  // 素养分析
  const literacyAnalysis: string[] = [];
  for (const [lit, data] of Object.entries(literacyRadar)) {
    const litDesc = getLiteracyDesc(lit);
    const levelText = levelDesc(data.level);
    literacyAnalysis.push(`${litDesc}（${Math.round(data.score * 100)}%，${levelText}）`);
  }
  
  if (literacyAnalysis.length > 0) {
    narrative += `素养维度分析：${literacyAnalysis.join('；')}。\n\n`;
  }

  // 总结与建议
  narrative += '综合建议：根据以上分析，请结合下方的4周干预计划和行动清单进行针对性训练。重点关注「待加强」的知识点，通过回归概念、重做错题和变式练习逐步提升。\n';

  const finalNarrative = narrative.trim() ||
    `本次诊断总分为 ${totalScore} 分（满分 ${formalQs.length || 1} 分，正确率 ${accuracy}%）。学生整体表现需要进一步提升，建议按照4周干预计划进行针对性训练。`;

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