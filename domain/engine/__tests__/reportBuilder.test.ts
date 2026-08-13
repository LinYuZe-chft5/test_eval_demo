/**
 * domain/engine/__tests__/reportBuilder.test.ts
 * 报告组装单元测试（1 个用例）
 */
import { describe, it, expect } from 'vitest';
import { buildReport } from '../reportBuilder';
import type { KpDep } from '../pathEngine';

describe('报告组装', () => {
  // 测试17: 报告组装(包含总分/适应性等级/模块掌握度/素养雷达/错因/4周计划)
  it('报告组装: 包含总分、适应性等级、模块掌握度、素养雷达、错因分布、4周计划', () => {
    const draft = buildReport(
      'stu1',
      [{ id: 's1' }],
      [
        {
          question_id: 'q1',
          kp_code: 'KP1',
          literacy: '计算',
          is_correct: false,
          score: 0,
          time_spent_ms: 20000,
          modify_count: 2,
          ec_code: 'EC-K',
        },
        {
          question_id: 'q2',
          kp_code: 'KP2',
          literacy: '推理',
          is_correct: true,
          score: 1,
          time_spent_ms: 5000,
          modify_count: 0,
        },
      ],
      [
        { id: 'q1', kp_code: 'KP1', literacy: '计算', expected_time_sec: 10, difficulty_est: 0.5 },
        { id: 'q2', kp_code: 'KP2', literacy: '推理', expected_time_sec: 10, difficulty_est: 0.5 },
      ],
      new Map<string, KpDep>(),
      [],
    );

    // 总分
    expect(draft.total_score).toBe(1);

    // 适应性等级 (1/2=50% < 60 → weak)
    expect(draft.adaptive_level).toBe('weak');

    // 模块掌握度: KP1=red(答错), KP2=green(答对)
    expect(draft.module_mastery['KP1'].level).toBe('red');
    expect(draft.module_mastery['KP2'].level).toBe('green');

    // 素养雷达: 计算/推理 两个维度
    expect(draft.literacy_radar['计算']).toBeDefined();
    expect(draft.literacy_radar['推理']).toBeDefined();
    expect(draft.literacy_radar['计算'].level).toBe('red');
    expect(draft.literacy_radar['推理'].level).toBe('green');

    // 错因分布
    expect(draft.ec_profile.primary).toBe('EC-K');

    // 4周计划
    expect(draft.plan_4week).toHaveLength(4);
    expect(draft.plan_4week.every((w) => w.week >= 1 && w.week <= 4)).toBe(true);
  });
});
