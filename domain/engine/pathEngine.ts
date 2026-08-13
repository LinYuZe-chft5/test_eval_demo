/**
 * domain/engine/pathEngine.ts
 * Codex_04 规则引擎 - 路径定序与追根溯源（纯函数实现）
 *
 * 包含：根因定位、依赖拓扑排序、四周学习计划生成。
 * 所有函数无副作用，输入输出明确。
 */
import { RULES } from '../config/rules';

// ===== 类型定义 =====
export interface KpDep {
  prerequisite_ids: string[];
  mastery_score?: number;
}

export interface MethodCard {
  id: string;
  kp_codes: string[];
  title?: string;
}

export interface PathQuestion {
  id: string;
  kp_code?: string | null;
  variant_of?: string | null;
  status?: string;
  difficulty_est?: number;
}

export interface WeekPlan {
  week: number;
  focus_kps: string[];
  method_cards: MethodCard[];
  questions: PathQuestion[];
}

// ===== 追根溯源 =====
/**
 * findRootCause - 沿 prerequisite_ids 递归下探
 *  - 取掌握度 < ROOT_CAUSE_THRESHOLD 的最深节点
 *  - 同深度取掌握度更低者
 *  - 若无可归因节点，返回 kpCode 本身
 */
export function findRootCause(
  kpCode: string,
  kpDeps: Map<string, KpDep>,
  masteryMap: Map<string, number>,
): string {
  const getScore = (code: string): number =>
    masteryMap.get(code) ?? kpDeps.get(code)?.mastery_score ?? 1;

  let best: string | null = null;
  let bestDepth = -1;

  const visit = (code: string, depth: number): void => {
    const score = getScore(code);
    if (score < RULES.ROOT_CAUSE_THRESHOLD) {
      if (
        best === null ||
        depth > bestDepth ||
        (depth === bestDepth && score < getScore(best as string))
      ) {
        bestDepth = depth;
        best = code;
      }
    }
    const deps = kpDeps.get(code)?.prerequisite_ids ?? [];
    for (const p of deps) visit(p, depth + 1);
  };

  visit(kpCode, 0);
  return best ?? kpCode;
}

// ===== 拓扑排序 =====
/**
 * topoSort - 按依赖关系拓扑排序（前置先排，掌握度越低越先）
 *  - Kahn 算法：入度=0 的节点中，掌握度最低者优先
 *  - 成环节点无法入度归零，将被丢弃
 */
export function topoSort(rootKps: string[], kpDeps: Map<string, KpDep>): string[] {
  const roots = Array.isArray(rootKps) ? rootKps : [];

  // 收集可达集合
  const set = new Set<string>();
  const collect = (code: string): void => {
    if (set.has(code)) return;
    set.add(code);
    const deps = kpDeps.get(code)?.prerequisite_ids ?? [];
    for (const p of deps) collect(p);
  };
  for (const r of roots) collect(r);

  // 入度 = 在集合内的前置依赖数
  const indeg = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const code of set) {
    indeg.set(code, 0);
    dependents.set(code, []);
  }
  for (const code of set) {
    const deps = kpDeps.get(code)?.prerequisite_ids ?? [];
    for (const p of deps) {
      if (set.has(p)) {
        indeg.set(code, (indeg.get(code) ?? 0) + 1);
        dependents.get(p)!.push(code);
      }
    }
  }

  const getScore = (code: string): number => kpDeps.get(code)?.mastery_score ?? 1;
  const available = new Set<string>([...set].filter((c) => indeg.get(c) === 0));
  const result: string[] = [];

  while (available.size > 0) {
    let pick: string | null = null;
    for (const c of available) {
      if (pick === null || getScore(c) < getScore(pick as string)) pick = c;
    }
    const node = pick as string;
    available.delete(node);
    result.push(node);
    for (const dep of dependents.get(node) ?? []) {
      indeg.set(dep, (indeg.get(dep) ?? 0) - 1);
      if (indeg.get(dep) === 0) available.add(dep);
    }
  }

  return result;
}

// ===== 四周计划 =====
/**
 * buildPlan4Week - 按 PLAN_WEEKS 切片，每周 1-2 个焦点考点 + 方法卡 + 变式题
 *  - 焦点考点按拓扑序连续切片
 *  - 方法卡：kp_codes 与本周焦点有交集
 *  - 题目：kp_code 命中本周焦点且 status='active'
 */
export function buildPlan4Week(
  sortedKps: string[],
  methodCards: MethodCard[],
  questions: PathQuestion[],
): WeekPlan[] {
  const kps = Array.isArray(sortedKps) ? sortedKps : [];
  const weeks = RULES.PLAN_WEEKS;
  const len = kps.length;
  const plans: WeekPlan[] = [];

  for (let w = 0; w < weeks; w++) {
    const start = Math.floor((w * len) / weeks);
    const end = Math.floor(((w + 1) * len) / weeks);
    const focus = kps.slice(start, end);
    const cards = (methodCards ?? []).filter((mc) =>
      (mc.kp_codes ?? []).some((k) => focus.includes(k)),
    );
    const qs = (questions ?? []).filter(
      (q) => focus.includes(q.kp_code ?? '') && q.status === 'active',
    );
    plans.push({
      week: w + 1,
      focus_kps: focus,
      method_cards: cards,
      questions: qs,
    });
  }

  return plans;
}
