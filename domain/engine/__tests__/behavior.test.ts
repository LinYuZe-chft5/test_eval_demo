/**
 * domain/engine/__tests__/behavior.test.ts
 * Codex_04 规则引擎 - 行为分析单元测试
 */
import { describe, it, expect } from 'vitest';
import {
  analyzeBehavior,
  assignBehaviorTag,
  type AnswerEvent,
} from '../behavior';

// ===== analyzeBehavior =====
describe('analyzeBehavior - 行为分析', () => {
  const baseEvents: AnswerEvent[] = [
    { type: 'enter', ts: 0 },
    { type: 'option_select', ts: 1000, key: 'A' },
    { type: 'submit', ts: 5000, self_mark: null },
  ];

  it('计算time_spent_ms(剔除中断)', () => {
    const events: AnswerEvent[] = [
      { type: 'enter', ts: 0 },
      { type: 'option_select', ts: 1000, key: 'A' },
      { type: 'screen_leave', ts: 2000 },
      { type: 'screen_enter', ts: 4000 },
      { type: 'submit', ts: 6000 },
    ];
    const r = analyzeBehavior(events, 60);
    expect(r.time_spent_ms).toBe(4000); // 6000 - 0 - 2000(leave gap)
  });

  it('无screen_leave时不扣减', () => {
    const r = analyzeBehavior(baseEvents, 60);
    expect(r.time_spent_ms).toBe(5000);
  });

  it('first_action_ms计算', () => {
    const r = analyzeBehavior(baseEvents, 60);
    expect(r.first_action_ms).toBe(1000);
  });

  it('modify_count: 选项变更计1次', () => {
    const events: AnswerEvent[] = [
      { type: 'enter', ts: 0 },
      { type: 'option_select', ts: 1000, key: 'A' },
      { type: 'option_change', ts: 2000, key: 'B' },
      { type: 'submit', ts: 3000 },
    ];
    const r = analyzeBehavior(events, 60);
    expect(r.option_path).toEqual(['A', 'B']);
  });

  it('hesitate_flag: 切换>=2次(去重后)', () => {
    const events: AnswerEvent[] = [
      { type: 'enter', ts: 0 },
      { type: 'option_select', ts: 1000, key: 'A' },
      { type: 'option_change', ts: 2000, key: 'B' },
      { type: 'option_change', ts: 3000, key: 'A' },
      { type: 'option_change', ts: 4000, key: 'C' },
      { type: 'submit', ts: 5000 },
    ];
    const r = analyzeBehavior(events, 60);
    expect(r.hesitate_flag).toBe(true);
  });

  it('hesitate_flag: 同一选项反复选择不计切换', () => {
    const events: AnswerEvent[] = [
      { type: 'enter', ts: 0 },
      { type: 'option_select', ts: 1000, key: 'A' },
      { type: 'option_change', ts: 2000, key: 'A' },
      { type: 'submit', ts: 3000 },
    ];
    const r = analyzeBehavior(events, 60);
    expect(r.hesitate_flag).toBe(false);
  });

  it('delete_rewrite_count: 清空重输', () => {
    const events: AnswerEvent[] = [
      { type: 'enter', ts: 0 },
      { type: 'fill', ts: 1000, value: 'abc' },
      { type: 'fill', ts: 2000, value: '' },
      { type: 'fill', ts: 3000, value: 'def' },
      { type: 'submit', ts: 4000 },
    ];
    const r = analyzeBehavior(events, 60);
    expect(r.delete_rewrite_count).toBe(1);
  });

  it('self_mark透传', () => {
    const events: AnswerEvent[] = [
      { type: 'enter', ts: 0 },
      { type: 'submit', ts: 5000, self_mark: 'guess' },
    ];
    const r = analyzeBehavior(events, 60);
    expect(r.self_mark).toBe('guess');
  });

  it('空事件数组安全', () => {
    const r = analyzeBehavior([], 60);
    expect(r.time_spent_ms).toBe(0);
  });
});

// ===== assignBehaviorTag =====
describe('assignBehaviorTag - 行为标签判定', () => {
  const baseBehavior = {
    time_spent_ms: 5000,
    first_action_ms: 1000,
    modify_count: 0,
    delete_rewrite_count: 0,
    option_path: ['A'],
    revisit_count: 0,
    hesitate_flag: false,
    behavior_tags: [],
    self_mark: null,
  };

  it('self_mark=guess → self_guess', () => {
    const r = assignBehaviorTag({ ...baseBehavior, self_mark: 'guess' }, false, 60);
    expect(r.behavior_tag).toBe('self_guess');
    expect(r.ec_recommended).toBeNull();
  });

  it('hesitate + 错 → hesitate_wrong + EC-C1', () => {
    const r = assignBehaviorTag({ ...baseBehavior, hesitate_flag: true }, false, 60);
    expect(r.behavior_tag).toBe('hesitate_wrong');
    expect(r.ec_recommended).toBe('EC-C1');
  });

  it('hesitate + 对 → hesitant_correct(伪掌握)', () => {
    const r = assignBehaviorTag({ ...baseBehavior, hesitate_flag: true }, true, 60);
    expect(r.behavior_tag).toBe('hesitant_correct');
    expect(r.ec_recommended).toBeNull();
  });

  it('slow + 错 → slow_wrong + EC-K', () => {
    const r = assignBehaviorTag({ ...baseBehavior, time_spent_ms: 200000 }, false, 60);
    expect(r.behavior_tag).toBe('slow_wrong');
    expect(r.ec_recommended).toBe('EC-K');
  });

  it('fast + 错 → fast_wrong + EC-N2', () => {
    const r = assignBehaviorTag({ ...baseBehavior, time_spent_ms: 5000 }, false, 60);
    expect(r.behavior_tag).toBe('fast_wrong');
    expect(r.ec_recommended).toBe('EC-N2');
  });

  it('abandoned → EC-N3', () => {
    const r = assignBehaviorTag({ ...baseBehavior, option_path: [], modify_count: 0, time_spent_ms: 200000 }, false, 60);
    expect(r.behavior_tag).toBe('abandoned');
    expect(r.ec_recommended).toBe('EC-N3');
  });

  it('rewrite + 对 → rewrite_correct + EC-M2', () => {
    const r = assignBehaviorTag({ ...baseBehavior, delete_rewrite_count: 3 }, true, 60);
    expect(r.behavior_tag).toBe('rewrite_correct');
    expect(r.ec_recommended).toBe('EC-M2');
  });

  it('默认：对→normal_correct', () => {
    const r = assignBehaviorTag(baseBehavior, true, 60);
    expect(r.behavior_tag).toBe('normal_correct');
  });

  it('默认：错→normal_wrong', () => {
    // 使用足够长的时长(30000ms > 24000ms快速阈值)，不触发快速/慢速分支
    const r = assignBehaviorTag({ ...baseBehavior, time_spent_ms: 30000 }, false, 60);
    expect(r.behavior_tag).toBe('normal_wrong');
  });
});
