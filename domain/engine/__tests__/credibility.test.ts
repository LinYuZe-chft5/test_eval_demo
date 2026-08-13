/**
 * domain/engine/__tests__/credibility.test.ts
 * Codex_04 规则引擎 - 低信度判定单元测试
 */
import { describe, it, expect } from 'vitest';
import { checkCredibility } from '../credibility';

describe('checkCredibility - 低信度判定(三取二)', () => {
  it('热身题全对+正常速度→高信度', () => {
    const sessions = [{ day: 1, warmup_correct: 2, warmup_total: 2 }];
    const records = [{ time_spent_ms: 60000 }];
    const questions = [{ expected_time_sec: 60 }];
    const r = checkCredibility(sessions as any, records as any, questions as any);
    expect(r.is_low_credibility).toBe(false);
  });

  it('热身题答错≥1→信号A触发', () => {
    const sessions = [{ day: 1, warmup_correct: 1, warmup_total: 2 }];
    const records = [{ time_spent_ms: 60000 }];
    const questions = [{ expected_time_sec: 60 }];
    const r = checkCredibility(sessions as any, records as any, questions as any);
    expect(r.signals).toContain('A');
  });

  it('平均时长远低于预期→信号B触发', () => {
    const sessions = [{ day: 1, warmup_correct: 2, warmup_total: 2 }];
    const records = [{ time_spent_ms: 1000 }, { time_spent_ms: 2000 }];
    const questions = [{ expected_time_sec: 60 }, { expected_time_sec: 60 }];
    const r = checkCredibility(sessions as any, records as any, questions as any);
    expect(r.signals).toContain('B');
  });

  it('满足2个信号→低信度', () => {
    const sessions = [{ day: 1, warmup_correct: 1, warmup_total: 2 }];
    const records = [{ time_spent_ms: 1000 }, { time_spent_ms: 2000 }];
    const questions = [{ expected_time_sec: 60 }, { expected_time_sec: 60 }];
    const r = checkCredibility(sessions as any, records as any, questions as any);
    expect(r.is_low_credibility).toBe(true);
  });

  it('仅1个信号→高信度', () => {
    const sessions = [{ day: 1, warmup_correct: 1, warmup_total: 2 }];
    const records = [{ time_spent_ms: 60000 }];
    const questions = [{ expected_time_sec: 60 }];
    const r = checkCredibility(sessions as any, records as any, questions as any);
    expect(r.is_low_credibility).toBe(false);
  });
});
