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

function levelFromRatio(ratio: number): MasteryLevel {
  if (ratio >= RULES.MASTERY_GREEN) return 'green';
  if (ratio >= RULES.MASTERY_YELLOW) return 'yellow';
  return 'red';
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

  // 总分
  const totalScore = recs.reduce(
    (s, r) => s + (typeof r.score === 'number' ? r.score : r.is_correct ? 1 : 0),
    0,
  );

  // 自适应等级
  const denom = qs.length || 1;
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
    moduleMastery[kp] = {
      mastery_score: m.mastery_score,
      level: combined,
      confidence: m.confidence,
    };
    masteryMap.set(kp, m.mastery_score);
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

  // 四周计划：薄弱 KP → 根因 → 拓扑排序
  const weakKps = Object.entries(moduleMastery)
    .filter(([, v]) => v.level !== 'green')
    .map(([k]) => k);
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

  // 行动清单
  const actionChecklist: ActionItem[] = [];
  for (const [kp, v] of Object.entries(moduleMastery)) {
    if (v.level === 'red') {
      actionChecklist.push({
        kp_code: kp,
        level: v.level,
        action: '重点补强 ' + kp + '：回归基础概念与例题',
      });
    } else if (v.level === 'yellow') {
      actionChecklist.push({
        kp_code: kp,
        level: v.level,
        action: '巩固 ' + kp + '：变式训练与易错点排查',
      });
    }
  }
  if (ecProfile.primary) {
    actionChecklist.push({
      kp_code: '*',
      level: 'red',
      ec_code: ecProfile.primary,
      action: '针对错因 ' + ecProfile.primary + ' 专项训练',
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

  // 叙述文本
  const greenCount = Object.values(moduleMastery).filter((v) => v.level === 'green').length;
  const redCount = Object.values(moduleMastery).filter((v) => v.level === 'red').length;
  const narrative =
    '本次诊断共完成 ' +
    qs.length +
    ' 题，得分 ' +
    totalScore +
    '，自适应等级为 ' +
    adaptiveLevel +
    '。掌握良好考点 ' +
    greenCount +
    ' 个，薄弱考点 ' +
    redCount +
    ' 个' +
    (ecProfile.primary ? '，主要错因为 ' + ecProfile.primary : '') +
    '。';

  return {
    student_id: studentId,
    total_score: totalScore,
    adaptive_level: adaptiveLevel,
    module_mastery: moduleMastery,
    literacy_radar: literacyRadar,
    ec_profile: ecProfile,
    plan_4week: plan4Week,
    action_checklist: actionChecklist,
    confidence_flags: confidenceFlags,
    degraded_texts: degradedTexts,
    narrative_text: narrative,
  };
}
