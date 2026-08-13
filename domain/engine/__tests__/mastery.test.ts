/**
 * domain/engine/__tests__/mastery.test.ts
 * Codex_04 规则引擎 - 掌握度判定单元测试
 */
import { describe, it, expect } from 'vitest';
import { calcKpMastery, calcConfidence, finalLevel } from '../mastery';
import type { MasteryRecord } from '../mastery';

describe('calcKpMastery - 知识点掌握度', () => {
  it('全部答对→green', () => {
    const records: MasteryRecord[] = [
      { is_correct: true, behavior_tag: 'normal_correct', self_mark: null },
      { is_correct: true, behavior_tag: 'normal_correct', self_mark: null },
      { is_correct: true, behavior_tag: 'normal_correct', self_mark: null },
    ];
    const r = calcKpMastery(records);
    expect(r.mastery_score).toBe(1);
    expect(r.level).toBe('green');
  });

  it('70%正确→yellow', () => {
    const records: MasteryRecord[] = [
      { is_correct: true, behavior_tag: 'normal_correct', self_mark: null },
      { is_correct: true, behavior_tag: 'normal_correct', self_mark: null },
      { is_correct: false, behavior_tag: 'normal_wrong', self_mark: null },
      { is_correct: true, behavior_tag: 'normal_correct', self_mark: null },
    ];
    const r = calcKpMastery(records);
    expect(r.level).toBe('yellow');
  });

  it('全部答错→red', () => {
    const records: MasteryRecord[] = [
      { is_correct: false, behavior_tag: 'normal_wrong', self_mark: null },
      { is_correct: false, behavior_tag: 'normal_wrong', self_mark: null },
    ];
    const r = calcKpMastery(records);
    expect(r.level).toBe('red');
  });

  it('排除self_mark=guess', () => {
    const records: MasteryRecord[] = [
      { is_correct: true, behavior_tag: 'self_guess', self_mark: 'guess' },
      { is_correct: true, behavior_tag: 'normal_correct', self_mark: null },
    ];
    const r = calcKpMastery(records);
    // 只有1道有效题(排除guess),答对1→mastery=1
    expect(r.mastery_score).toBe(1);
  });

  it('排除invalid_input', () => {
    const records: MasteryRecord[] = [
      { is_correct: false, behavior_tag: 'normal_wrong', self_mark: null, invalid_input: true },
      { is_correct: true, behavior_tag: 'normal_correct', self_mark: null },
    ];
    const r = calcKpMastery(records);
    expect(r.mastery_score).toBe(1);
  });

  it('空记录→red', () => {
    const r = calcKpMastery([]);
    expect(r.level).toBe('red');
  });
});

describe('calcConfidence - 配对信度', () => {
  it('全对→green/high', () => {
    const records = [
      { is_correct: true, pairing_id: 'P1' },
      { is_correct: true, pairing_id: 'P1' },
    ];
    const r = calcConfidence(records as any);
    expect(r.level).toBe('green');
    expect(r.confidence).toBe('high');
  });

  it('全错→red/high', () => {
    const records = [
      { is_correct: false, pairing_id: 'P1' },
      { is_correct: false, pairing_id: 'P1' },
    ];
    const r = calcConfidence(records as any);
    expect(r.level).toBe('red');
  });

  it('对错各一→yellow/mid', () => {
    const records = [
      { is_correct: true, pairing_id: 'P1' },
      { is_correct: false, pairing_id: 'P1' },
    ];
    const r = calcConfidence(records as any);
    expect(r.level).toBe('yellow');
  });

  it('单题→green/mid', () => {
    const records = [{ is_correct: true }];
    const r = calcConfidence(records as any);
    expect(r.level).toBe('green');
  });
});

describe('finalLevel - 融合等级', () => {
  it('green+green→green', () => {
    expect(finalLevel('green', 'green')).toBe('green');
  });
  it('green+yellow→yellow(取较差)', () => {
    expect(finalLevel('green', 'yellow')).toBe('yellow');
  });
  it('yellow+red→red', () => {
    expect(finalLevel('yellow', 'red')).toBe('red');
  });
});
