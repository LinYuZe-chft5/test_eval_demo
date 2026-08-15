﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿/**
 * domain/engine/probe.ts
 * Codex_04 规则引擎 - 二次探测（纯函数实现）
 *
 * 包含：是否触发探测、探测题选择、探测结果回填。
 * 所有函数无副作用，输入输出明确。
 */
import { RULES } from '../config/rules';

// ===== 类型定义 =====
export interface ProbeRecord {
  question_id: string;
  is_correct: boolean;
  time_spent_ms: number;
  self_mark?: string | null;
  behavior_tag?: string | null;
  invalid_input?: boolean;
}

export interface ProbeQuestion {
  id: string;
  expected_time_sec: number;
  parallel_group_id?: string | null;
  kp_code?: string | null;
  difficulty_est?: number;
  variant_of?: string | null;
  status?: 'active' | 'inactive';
  is_anchor?: boolean;
}

export interface ProbeGradedResult {
  probe_result: 'confirmed_guess' | 'confirmed_mastered';
  behavior_tag_update: string | null;
}

// ===== 是否触发探测 =====
/**
 * shouldProbe - 快速答对且未自评时触发探测
 * 条件：
 *  - record.is_correct
 *  - record.time_spent_ms < question.expected_time_sec * 1000 * FAST_ANSWER_RATIO
 *  - sessionProbeCount < PROBE_MAX_PER_SESSION
 *  - record.self_mark IS NULL
 */
export function shouldProbe(
  record: ProbeRecord,
  question: ProbeQuestion,
  sessionProbeCount: number,
): boolean {
  if (!record || !record.is_correct) return false;
  // self_mark 必须为 null/undefined
  if (record.self_mark !== null && record.self_mark !== undefined) return false;
  const fastThreshold = question.expected_time_sec * 1000 * RULES.FAST_ANSWER_RATIO;
  if (!(record.time_spent_ms < fastThreshold)) return false;
  if (!(sessionProbeCount < RULES.PROBE_MAX_PER_SESSION)) return false;
  return true;
}

// ===== 探测题选择 =====
/**
 * selectProbeQuestion - 选择同平行组（优先）或同 KP 且难度相近的探测题
 *  - 同 parallel_group_id 优先
 *  - 否则同 kp_code 且 |difficulty_est 差| <= PROBE_DIFF_TOLERANCE
 *  - 排除：本 session 已出现、variant_of === question.id（同母题变式）、非 active、锚题
 */
export function selectProbeQuestion(
  record: ProbeRecord,
  question: ProbeQuestion,
  allQuestions: ProbeQuestion[],
  sessionQuestionIds: string[],
): ProbeQuestion | null {
  void record;
  const seen = new Set<string>(sessionQuestionIds ?? []);
  const candidates = (allQuestions ?? []).filter(
    (q) =>
      q.id !== question.id &&
      q.status === 'active' &&
      !q.is_anchor &&
      !seen.has(q.id) &&
      q.variant_of !== question.id,
  );

  const pickClosest = (list: ProbeQuestion[]): ProbeQuestion | null => {
    if (list.length === 0) return null;
    const baseDiff = question.difficulty_est ?? 0;
    let best = list[0];
    let bestDelta = Infinity;
    for (const q of list) {
      const delta = Math.abs((q.difficulty_est ?? 0) - baseDiff);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = q;
      }
    }
    return best;
  };

  // 优先同平行组
  const sameParallel = candidates.filter(
    (q) => !!q.parallel_group_id && q.parallel_group_id === question.parallel_group_id,
  );
  if (sameParallel.length > 0) return pickClosest(sameParallel);

  // 其次同 KP 且难度相近
  const kpMatch = candidates.filter(
    (q) =>
      !!q.kp_code &&
      q.kp_code === question.kp_code &&
      Math.abs((q.difficulty_est ?? 0) - (question.difficulty_est ?? 0)) <=
        RULES.PROBE_DIFF_TOLERANCE,
  );
  if (kpMatch.length > 0) return pickClosest(kpMatch);

  return null;
}

// ===== 探测结果回填 =====
/**
 * onProbeGraded - 探测判分后回填结果
 *  - 探测答错：confirmed_guess，behavior_tag += "guess_tendency"
 *  - 探测答对：confirmed_mastered
 */
export function onProbeGraded(
  probeRecord: ProbeRecord,
  originalRecord: ProbeRecord,
): ProbeGradedResult {
  if (!probeRecord.is_correct) {
    const prev = originalRecord?.behavior_tag;
    const tag = prev ? prev + '+guess_tendency' : 'guess_tendency';
    return { probe_result: 'confirmed_guess', behavior_tag_update: tag };
  }
  return {
    probe_result: 'confirmed_mastered',
    behavior_tag_update: originalRecord?.behavior_tag ?? null,
  };
}
