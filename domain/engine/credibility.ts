/**
 * domain/engine/credibility.ts
 * Codex_04 规则引擎 - 低信度判定（纯函数实现）
 *
 * 包含：三信号检测（热身题答错 / 全卷低时 / 修改率异常）与低信度裁决。
 * 所有函数无副作用，输入输出明确。
 */
import { RULES } from '../config/rules';

// ===== 类型定义 =====
export interface CredSession {
  id: string;
}

export interface CredRecord {
  question_id: string;
  session_id?: string;
  is_correct: boolean;
  time_spent_ms: number;
  modify_count: number;
}

export interface CredQuestion {
  id: string;
  expected_time_sec: number;
  is_warmup?: boolean;
}

export interface CredibilityResult {
  is_low_credibility: boolean;
  signals: string[];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ===== 低信度判定 =====
/**
 * checkCredibility - 三信号检测，满足 >= CREDIBILITY_PASS_MIN(2) 个判低信度
 *  - 信号A：热身题答错 >= 1（三日合计）
 *  - 信号B：全卷平均 time_spent < 全卷平均 expected_time × LOW_TIME_RATIO
 *  - 信号C：修改率异常（modify_count 中位数 = 0 且 平均 time < 预期 × 0.7）
 */
export function checkCredibility(
  sessions: CredSession[],
  records: CredRecord[],
  questions: CredQuestion[],
): CredibilityResult {
  void sessions;
  const recs = Array.isArray(records) ? records : [];
  const qs = Array.isArray(questions) ? questions : [];
  const qMap = new Map<string, CredQuestion>(qs.map((q) => [q.id, q]));
  const signals: string[] = [];

  // 信号A：热身题答错 >= 1
  const warmupWrong = recs.some((r) => {
    const q = qMap.get(r.question_id);
    return q?.is_warmup === true && r.is_correct === false;
  });
  if (warmupWrong) signals.push('A');

  // 仅统计能在题库中匹配到的问题
  const answered = recs.filter((r) => qMap.has(r.question_id));
  if (answered.length > 0) {
    const avgTime =
      answered.reduce((s, r) => s + (r.time_spent_ms ?? 0), 0) / answered.length;
    const avgExpected =
      answered.reduce(
        (s, r) => s + (qMap.get(r.question_id)!.expected_time_sec * 1000),
        0,
      ) / answered.length;

    // 信号B：平均时长过低
    if (avgTime < avgExpected * RULES.LOW_TIME_RATIO) signals.push('B');

    // 信号C：修改率异常（中位 modify_count=0 且 平均 time < 预期 × 0.7）
    const med = median(answered.map((r) => r.modify_count ?? 0));
    if (med === 0 && avgTime < avgExpected * 0.7) signals.push('C');
  }

  const isLow = signals.length >= RULES.CREDIBILITY_PASS_MIN;
  return { is_low_credibility: isLow, signals };
}
