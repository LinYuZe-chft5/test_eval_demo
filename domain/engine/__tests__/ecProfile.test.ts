/**
 * domain/engine/__tests__/ecProfile.test.ts
 * 错因分布单元测试（1 个用例）
 */
import { describe, it, expect } from 'vitest';
import { calcEcProfile } from '../ecProfile';
import type { ErrorRecord } from '../ecProfile';

describe('错因分布', () => {
  // 测试13: 错因分布(主错因占比>=0.2,次错因)
  it('错因分布: 主错因占比>=0.2,次错因为占比次高', () => {
    const records: ErrorRecord[] = [
      { ec_code: 'EC-A' },
      { ec_code: 'EC-A' },
      { ec_code: 'EC-A' },
      { ec_code: 'EC-B' },
      { ec_code: 'EC-B' },
      { ec_code: 'EC-C' },
    ];
    const profile = calcEcProfile(records);
    // 分母 = 6
    // EC-A: 3/6 = 0.5 >= EC_PRIMARY_MIN_RATIO(0.2) → primary
    expect(profile.primary).toBe('EC-A');
    expect(profile.distribution['EC-A'].ratio).toBeCloseTo(0.5, 5);
    // EC-B: 2/6 ≈ 0.33,次高且 > 0 → secondary
    expect(profile.secondary).toBe('EC-B');
    expect(profile.distribution['EC-B'].ratio).toBeCloseTo(2 / 6, 5);
    // EC-C: 1/6 ≈ 0.17
    expect(profile.distribution['EC-C'].count).toBe(1);
  });
});
