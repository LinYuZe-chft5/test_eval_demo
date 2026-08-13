/**
 * domain/engine/__tests__/pathEngine.test.ts
 * 路径定序与追根溯源单元测试（2 个用例）
 */
import { describe, it, expect } from 'vitest';
import { findRootCause, topoSort } from '../pathEngine';
import type { KpDep } from '../pathEngine';

describe('路径定序与追根溯源', () => {
  // 测试14: 追根溯源(沿prerequisite_ids递归,取掌握度<0.5的最深节点)
  it('追根溯源: 取掌握度<0.5的最深节点', () => {
    const kpDeps = new Map<string, KpDep>([
      ['KP', { prerequisite_ids: ['A'] }],
      ['A', { prerequisite_ids: ['B'] }],
      ['B', { prerequisite_ids: [] }],
    ]);
    const masteryMap = new Map<string, number>([
      ['KP', 0.2], // < 0.5
      ['A', 0.4], // < 0.5,更深
      ['B', 0.9], // >= 0.5,不取
    ]);
    // 沿 KP→A→B 递归,A 深度=1 且掌握度 0.4 < 0.5,是最深符合条件的节点
    expect(findRootCause('KP', kpDeps, masteryMap)).toBe('A');
  });

  // 测试15: 拓扑排序(前置掌握度越低越前)
  it('拓扑排序: 前置掌握度越低越前', () => {
    const kpDeps = new Map<string, KpDep>([
      ['KP1', { prerequisite_ids: ['A', 'B'], mastery_score: 0.9 }],
      ['A', { prerequisite_ids: [], mastery_score: 0.3 }],
      ['B', { prerequisite_ids: [], mastery_score: 0.6 }],
    ]);
    const result = topoSort(['KP1'], kpDeps);
    // A(0.3) 和 B(0.6) 入度为 0,掌握度低的 A 先排
    // 然后 KP1 入度归零后排在最后
    expect(result).toEqual(['A', 'B', 'KP1']);
  });
});
