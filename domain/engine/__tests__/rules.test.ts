/**
 * domain/engine/__tests__/rules.test.ts
 * 规则常量完整性单元测试（1 个用例）
 */
import { describe, it, expect } from 'vitest';
import { RULES, getDayTimeLimitMin } from '../../config/rules';

describe('规则常量完整性', () => {
  // 测试18: 规则常量完整性(验证所有必需的阈值存在且在合理范围内)
  it('规则常量: 所有阈值存在且在合理范围内', () => {
    // 行为判定阈值
    expect(RULES.HESITATE_SWITCH_MIN).toBeGreaterThan(0);
    expect(RULES.FAST_ANSWER_RATIO).toBeGreaterThan(0);
    expect(RULES.FAST_ANSWER_RATIO).toBeLessThan(1);
    expect(RULES.SLOW_ANSWER_RATIO).toBeGreaterThan(1);
    expect(RULES.DELETE_REWRITE_MIN).toBeGreaterThan(0);
    expect(RULES.LOW_TIME_RATIO).toBeGreaterThan(0);
    expect(RULES.LOW_TIME_RATIO).toBeLessThan(1);

    // 二次探测阈值
    expect(RULES.PROBE_DIFF_TOLERANCE).toBeGreaterThan(0);
    expect(RULES.PROBE_DIFF_TOLERANCE).toBeLessThan(1);
    expect(RULES.PROBE_MAX_PER_SESSION).toBeGreaterThan(0);

    // 掌握度阈值
    expect(RULES.MASTERY_GREEN).toBeGreaterThan(0);
    expect(RULES.MASTERY_GREEN).toBeLessThan(1);
    expect(RULES.MASTERY_YELLOW).toBeGreaterThan(0);
    expect(RULES.MASTERY_YELLOW).toBeLessThan(RULES.MASTERY_GREEN);
    expect(RULES.ROOT_CAUSE_THRESHOLD).toBeGreaterThan(0);
    expect(RULES.ROOT_CAUSE_THRESHOLD).toBeLessThan(1);

    // 低信度阈值
    expect(RULES.CREDIBILITY_SIGNALS).toBeGreaterThan(0);
    expect(RULES.CREDIBILITY_PASS_MIN).toBeGreaterThan(0);
    expect(RULES.CREDIBILITY_PASS_MIN).toBeLessThanOrEqual(RULES.CREDIBILITY_SIGNALS);

    // 报告阈值
    expect(RULES.ADAPT_PASS_SCORE).toBeGreaterThan(RULES.ADAPT_BASIC_SCORE);
    expect(RULES.ADAPT_BASIC_SCORE).toBeGreaterThan(0);
    expect(RULES.EC_PRIMARY_MIN_RATIO).toBeGreaterThan(0);
    expect(RULES.EC_PRIMARY_MIN_RATIO).toBeLessThan(1);
    expect(RULES.PLAN_WEEKS).toBeGreaterThan(0);

    // 每日时限函数
    expect(getDayTimeLimitMin(1)).toBe(30);
    expect(getDayTimeLimitMin(2)).toBe(35);
    expect(getDayTimeLimitMin(3)).toBe(40);
  });
});
