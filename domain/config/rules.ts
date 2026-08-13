/**
 * domain/config/rules.ts
 * 全局规则常量 - 全部标注 _calibrate 的参数，前200单数据后统一回校。
 * 文档间冲突时以 Codex_04 规则引擎规格为准。
 * 所有阈值为"待校准"参数，禁止散落硬编码。
 */
export const RULES = {
  // ===== 作答流程 =====
  DAY_TIME_LIMIT_MIN: { 1: 30, 2: 35, 3: 40 } as const,
  TIME_WARN_BEFORE_MIN: 5,
  ACCESS_VALID_DAYS: 7,
  WARMUP_COUNT_PER_DAY: 2,

  // ===== 行为判定（_calibrate） =====
  HESITATE_SWITCH_MIN: 2,
  FAST_ANSWER_RATIO: 0.4,
  SLOW_ANSWER_RATIO: 2.0,
  DELETE_REWRITE_MIN: 3,
  LOW_TIME_RATIO: 0.5,

  // ===== 二次探测（_calibrate） =====
  PROBE_DIFF_TOLERANCE: 0.05,
  PROBE_MAX_PER_SESSION: 3,

  // ===== 掌握度（_calibrate） =====
  MASTERY_GREEN: 0.8,
  MASTERY_YELLOW: 0.5,
  ROOT_CAUSE_THRESHOLD: 0.5,

  // ===== 低信度答卷（三取二） =====
  CREDIBILITY_SIGNALS: 3,
  CREDIBILITY_PASS_MIN: 2,

  // ===== 报告（_calibrate） =====
  ADAPT_PASS_SCORE: 75,
  ADAPT_BASIC_SCORE: 60,
  EC_PRIMARY_MIN_RATIO: 0.2,
  PLAN_WEEKS: 4,
} as const;

export function getDayTimeLimitMin(day: 1 | 2 | 3): number {
  return RULES.DAY_TIME_LIMIT_MIN[day];
}
