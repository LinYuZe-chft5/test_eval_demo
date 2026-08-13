/**
 * domain/engine/__tests__/probe.test.ts
 * 二次探索单元测试（2 个用例）
 */
import { describe, it, expect } from 'vitest';
import { shouldProbe, selectProbeQuestion } from '../probe';
import type { ProbeRecord, ProbeQuestion } from '../probe';

describe('二次探测', () => {
  // 测试9: 二次探测触发条件(答对+秒选+未自我标记+未超上限)
  it('触发条件: 答对+秒选+未自我标记+未超上限 → 触发探测', () => {
    const expectedSec = 10;
    const question: ProbeQuestion = { id: 'q1', expected_time_sec: expectedSec };

    // 满足全部条件: 答对 + 耗时 < 4秒(预期×0.4) + 无自我标记 + 未超上限
    const record: ProbeRecord = {
      question_id: 'q1',
      is_correct: true,
      time_spent_ms: 3000,
      self_mark: null,
    };
    expect(shouldProbe(record, question, 0)).toBe(true);

    // 答错 → 不触发
    expect(shouldProbe({ ...record, is_correct: false }, question, 0)).toBe(false);

    // 已自我标记 → 不触发
    expect(shouldProbe({ ...record, self_mark: 'guess' }, question, 0)).toBe(false);

    // 超过本 session 探测上限 → 不触发
    expect(shouldProbe(record, question, 3)).toBe(false);
  });

  // 测试10: 平行题选择(同parallel_group_id或同kp_code+难度差<=0.05)
  it('平行题选择: 优先同parallel_group_id,其次同kp_code且难度差<=0.05', () => {
    const record: ProbeRecord = {
      question_id: 'q1',
      is_correct: true,
      time_spent_ms: 3000,
    };

    // 场景1: 同 parallel_group_id 优先
    const question: ProbeQuestion = {
      id: 'q1',
      expected_time_sec: 10,
      parallel_group_id: 'pg1',
      kp_code: 'KP1',
      difficulty_est: 0.5,
    };
    const sameGroup: ProbeQuestion[] = [
      {
        id: 'q2',
        expected_time_sec: 10,
        parallel_group_id: 'pg1',
        kp_code: 'KP2',
        difficulty_est: 0.5,
        status: 'active',
        is_anchor: false,
      },
    ];
    const result1 = selectProbeQuestion(record, question, sameGroup, []);
    expect(result1).not.toBeNull();
    expect(result1?.id).toBe('q2');

    // 场景2: 无同平行组时,同 kp_code 且难度差 <= 0.05
    const question2: ProbeQuestion = {
      id: 'q1',
      expected_time_sec: 10,
      parallel_group_id: null,
      kp_code: 'KP1',
      difficulty_est: 0.5,
    };
    const sameKp: ProbeQuestion[] = [
      {
        id: 'q3',
        expected_time_sec: 10,
        kp_code: 'KP1',
        difficulty_est: 0.52, // 难度差 |0.52-0.5|=0.02 <= 0.05
        status: 'active',
        is_anchor: false,
      },
    ];
    const result2 = selectProbeQuestion(record, question2, sameKp, []);
    expect(result2).not.toBeNull();
    expect(result2?.id).toBe('q3');
  });
});
