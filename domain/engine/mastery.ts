/**
 * domain/engine/mastery.ts
 * Codex_04 规则引擎 - 掌握度判定（纯函数实现）
 *
 * 包含：KP 掌握度计算、配对题置信度计算、最终等级融合。
 * 所有函数无副作用，输入输出明确。
 */
import { RULES } from '../config/rules';

// ===== 类型定义 =====
export type MasteryLevel = 'red' | 'yellow' | 'green';
export type Confidence = 'low' | 'mid' | 'high';

export interface MasteryRecord {
  is_correct: boolean;
  self_mark?: string | null;
  invalid_input?: boolean;
  behavior_tag?: string | null;
  probe_result?: string | null;
  pairing_id?: string | null;
}

export interface KpMasteryResult {
  mastery_score: number;
  level: MasteryLevel;
  confidence: Confidence;
}

export interface ConfidenceResult {
  level: MasteryLevel;
  confidence: Confidence;
}

const LEVEL_RANK: Record<MasteryLevel, number> = { red: 0, yellow: 1, green: 2 };

function rankToLevel(rank: number): MasteryLevel {
  if (rank >= 2) return 'green';
  if (rank >= 1) return 'yellow';
  return 'red';
}

// ===== KP 掌握度 =====
/**
 * calcKpMastery - 掌握度 = 有效得分题数 / 有效题数
 *  - 排除：self_mark=guess、invalid_input、abandoned
 *  - 探测修正：confirmed_guess 按 0 分计入分子；hesitant_correct 按 0.5 计入
 *  - level: >= MASTERY_GREEN → green；>= MASTERY_YELLOW → yellow；否则 red
 *  - confidence：按有效题数（>=5 high / >=2 mid / 否则 low）
 */
export function calcKpMastery(records: MasteryRecord[]): KpMasteryResult {
  const recs = Array.isArray(records) ? records : [];
  let numerator = 0;
  let denom = 0;
  for (const r of recs) {
    if (r.self_mark === 'guess') continue;
    if (r.invalid_input) continue;
    if (r.behavior_tag === 'abandoned') continue;
    denom++;
    if (r.probe_result === 'confirmed_guess') {
      numerator += 0;
    } else if (r.behavior_tag === 'hesitant_correct') {
      numerator += 0.5;
    } else if (r.is_correct) {
      numerator += 1;
    }
  }
  const score = denom > 0 ? numerator / denom : 0;
  const level: MasteryLevel =
    score >= RULES.MASTERY_GREEN ? 'green' : score >= RULES.MASTERY_YELLOW ? 'yellow' : 'red';
  const confidence: Confidence = denom >= 5 ? 'high' : denom >= 2 ? 'mid' : 'low';
  return { mastery_score: score, level, confidence };
}

// ===== 配对题置信度 =====
/**
 * calcConfidence - 配对题（pairing_id 组内 >=2 题）置信度
 *  - 按 pairing_id 分组，每组独立计算
 *  - 全对 → green/high
 *  - 全错 → red/high
 *  - 错 1 对 1（混合）→ yellow/mid
 *  - 单题：对 → green/mid；错 → yellow/mid
 *  - 最终取所有组中最差的置信度
 */
export function calcConfidence(pairingRecords: MasteryRecord[]): ConfidenceResult {
  const recs = Array.isArray(pairingRecords) ? pairingRecords : [];
  if (recs.length === 0) return { level: 'red', confidence: 'low' };

  // 按 pairing_id 分组
  const groups = new Map<string, MasteryRecord[]>();
  const noGroup: MasteryRecord[] = [];
  for (const r of recs) {
    if (r.pairing_id) {
      if (!groups.has(r.pairing_id)) groups.set(r.pairing_id, []);
      groups.get(r.pairing_id)!.push(r);
    } else {
      noGroup.push(r);
    }
  }

  // 计算每组的置信度
  const allResults: ConfidenceResult[] = [];

  // 处理有 pairing_id 的组
  for (const [, group] of groups) {
    allResults.push(calcGroupConfidence(group));
  }

  // 处理无 pairing_id 的记录（单题模式）
  for (const r of noGroup) {
    allResults.push(calcGroupConfidence([r]));
  }

  if (allResults.length === 0) return { level: 'red', confidence: 'low' };

  // 取所有组中最差的置信度
  let worstLevel: MasteryLevel = 'green';
  let worstConfidence: Confidence = 'high';
  const levelRank: Record<MasteryLevel, number> = { red: 0, yellow: 1, green: 2 };
  const confRank: Record<Confidence, number> = { low: 0, mid: 1, high: 2 };

  for (const result of allResults) {
    if (levelRank[result.level] < levelRank[worstLevel]) worstLevel = result.level;
    if (confRank[result.confidence] < confRank[worstConfidence]) worstConfidence = result.confidence;
  }

  return { level: worstLevel, confidence: worstConfidence };
}

/** 内部：计算单组置信度 */
function calcGroupConfidence(records: MasteryRecord[]): ConfidenceResult {
  if (records.length >= 2) {
    const correctCount = records.filter((r) => r.is_correct).length;
    if (correctCount === records.length) return { level: 'green', confidence: 'high' };
    if (correctCount === 0) return { level: 'red', confidence: 'high' };
    return { level: 'yellow', confidence: 'mid' };
  }
  // 单题
  if (records[0].is_correct) return { level: 'green', confidence: 'mid' };
  return { level: 'yellow', confidence: 'mid' };
}

// ===== 最终等级融合 =====
/**
 * finalLevel - 取掌握度等级与置信度等级的较差者
 */
export function finalLevel(masteryLevel: MasteryLevel, confidenceLevel: MasteryLevel): MasteryLevel {
  const worse = Math.min(LEVEL_RANK[masteryLevel], LEVEL_RANK[confidenceLevel]);
  return rankToLevel(worse);
}
