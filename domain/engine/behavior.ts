/**
 * domain/engine/behavior.ts
 * Codex_04 规则引擎 - 行为分析（纯函数实现）
 *
 * 包含：作答事件时序流分析、行为标签与错因推荐。
 * 所有函数无副作用，输入输出明确。
 */
import { RULES } from '../config/rules';

// ===== 类型定义 =====
export type AnswerEventType =
  | 'enter'
  | 'submit'
  | 'screen_leave'
  | 'screen_enter'
  | 'option_select'
  | 'option_change'
  | 'fill'
  | 'step'
  | 'revisit'
  | 'click';

export interface AnswerEvent {
  type: AnswerEventType;
  ts: number;
  /** option_select / option_change 携带的选项 key */
  key?: string;
  /** fill / step 携带的内容 */
  value?: string;
  /** step 序号 */
  seq?: number;
  /** submit 事件可携带自我标记（guess 等） */
  self_mark?: string | null;
}

export interface BehaviorResult {
  time_spent_ms: number;
  first_action_ms: number;
  modify_count: number;
  delete_rewrite_count: number;
  option_path: string[];
  revisit_count: number;
  hesitate_flag: boolean;
  behavior_tags: string[];
  /** 由 submit 事件携带透传，供 assignBehaviorTag 使用 */
  self_mark?: string | null;
}

export interface BehaviorTagResult {
  behavior_tag: string;
  ec_recommended: string | null;
}

const ACTION_TYPES = new Set<AnswerEventType>([
  'option_select',
  'option_change',
  'fill',
  'step',
  'click',
]);

// ===== 行为分析 =====
/**
 * analyzeBehavior - 解析 answer_events 时序流
 * - time_spent_ms = submit.ts - enter.ts（剔除 screen_leave 中断时段）
 * - first_action_ms = first_click.ts - enter.ts
 * - modify_count = fill/step 内容变更次数（首次输入不计，后续变化计 1）
 * - delete_rewrite_count = 清空重输次数（非空→空→非空 为 1 次）
 * - option_path = option_select/change 的 key 序列
 * - revisit_count = revisit 事件计数
 * - hesitate_flag = option_path 去重后切换次数 >= HESITATE_SWITCH_MIN
 */
export function analyzeBehavior(events: AnswerEvent[], expectedTimeSec: number): BehaviorResult {
  const evs = Array.isArray(events) ? events : [];
  void expectedTimeSec; // 行为统计本身不依赖预期时长，保留参数以匹配规格签名

  const enterEv = evs.find((e) => e.type === 'enter');
  const submitEv = [...evs].reverse().find((e) => e.type === 'submit');
  const enterTs = enterEv ? enterEv.ts : evs.length ? evs[0].ts : 0;
  const submitTs = submitEv ? submitEv.ts : evs.length ? evs[evs.length - 1].ts : enterTs;

  // 剔除 screen_leave 中断时段
  let leaveGap = 0;
  let leaveStart: number | null = null;
  for (const e of evs) {
    if (e.type === 'screen_leave') {
      leaveStart = e.ts;
    } else if (e.type === 'screen_enter' && leaveStart !== null) {
      const gap = e.ts - leaveStart;
      if (gap > 0) leaveGap += gap;
      leaveStart = null;
    }
  }
  // 未配对的 screen_leave：算至 submit
  if (leaveStart !== null) {
    const gap = submitTs - leaveStart;
    if (gap > 0) leaveGap += gap;
  }
  const timeSpent = Math.max(0, submitTs - enterTs - leaveGap);

  // 首次动作
  const firstAction = evs.find((e) => ACTION_TYPES.has(e.type));
  const firstActionMs = firstAction ? Math.max(0, firstAction.ts - enterTs) : 0;

  // modify_count / delete_rewrite_count
  let modifyCount = 0;
  let deleteRewrite = 0;
  const lastValue: Record<string, string> = {};
  const cleared: Record<string, boolean> = {};
  for (const e of evs) {
    if (e.type !== 'fill' && e.type !== 'step') continue;
    const key = e.type === 'step' ? `step:${e.seq ?? 0}` : 'fill';
    const val = e.value ?? '';
    if (key in lastValue) {
      if (val !== lastValue[key]) modifyCount++;
      if (val === '' && lastValue[key] !== '') {
        cleared[key] = true;
      } else if (val !== '' && cleared[key]) {
        deleteRewrite++;
        cleared[key] = false;
      }
    }
    lastValue[key] = val;
  }

  // option_path
  const optionPath: string[] = [];
  for (const e of evs) {
    if ((e.type === 'option_select' || e.type === 'option_change') && e.key != null) {
      optionPath.push(e.key);
    }
  }

  const revisitCount = evs.filter((e) => e.type === 'revisit').length;

  // hesitate_flag：连续去重后的切换次数
  const deduped: string[] = [];
  for (const k of optionPath) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== k) deduped.push(k);
  }
  const switches = Math.max(0, deduped.length - 1);
  const hesitateFlag = switches >= RULES.HESITATE_SWITCH_MIN;

  const selfMark = submitEv?.self_mark ?? null;

  return {
    time_spent_ms: timeSpent,
    first_action_ms: firstActionMs,
    modify_count: modifyCount,
    delete_rewrite_count: deleteRewrite,
    option_path: optionPath,
    revisit_count: revisitCount,
    hesitate_flag: hesitateFlag,
    behavior_tags: [],
    self_mark: selfMark,
  };
}

// ===== 行为标签 =====
/**
 * assignBehaviorTag - 依据行为结果与正误给出标签及错因推荐
 * 优先级：self_guess > abandoned > hesitate(对/错) > rewrite_correct > slow_wrong > fast_wrong > 默认
 */
export function assignBehaviorTag(
  behaviorResult: BehaviorResult,
  isCorrect: boolean,
  expectedTimeSec: number,
): BehaviorTagResult {
  const br = behaviorResult;
  const expectedMs = expectedTimeSec * 1000;

  // 1. self_mark=guess → self_guess（不归因）
  if (br.self_mark === 'guess') {
    return { behavior_tag: 'self_guess', ec_recommended: null };
  }

  // 2. 中途放弃（空白超时）：无内容且时长超 SLOW
  const noContent = br.option_path.length === 0 && br.modify_count === 0;
  if (noContent && br.time_spent_ms >= expectedMs * RULES.SLOW_ANSWER_RATIO) {
    return { behavior_tag: 'abandoned', ec_recommended: 'EC-N3' };
  }

  // 3. hesitate：对/错分别处理
  if (br.hesitate_flag) {
    if (!isCorrect) return { behavior_tag: 'hesitate_wrong', ec_recommended: 'EC-C1' };
    return { behavior_tag: 'hesitant_correct', ec_recommended: null }; // 伪掌握，不归因
  }

  // 4. rewrite_correct：清空重输达阈值且答对
  if (isCorrect && br.delete_rewrite_count >= RULES.DELETE_REWRITE_MIN) {
    return { behavior_tag: 'rewrite_correct', ec_recommended: 'EC-M2' };
  }

  // 5. 慢且错 → slow_wrong（EC-K 类）
  if (!isCorrect && br.time_spent_ms >= expectedMs * RULES.SLOW_ANSWER_RATIO) {
    return { behavior_tag: 'slow_wrong', ec_recommended: 'EC-K' };
  }

  // 6. 快且错 → fast_wrong（EC-N2 或 EC-C1，取 EC-N2）
  if (!isCorrect && expectedMs > 0 && br.time_spent_ms < expectedMs * RULES.FAST_ANSWER_RATIO) {
    return { behavior_tag: 'fast_wrong', ec_recommended: 'EC-N2' };
  }

  // 7. 默认
  if (isCorrect) return { behavior_tag: 'normal_correct', ec_recommended: null };
  return { behavior_tag: 'normal_wrong', ec_recommended: null };
}
