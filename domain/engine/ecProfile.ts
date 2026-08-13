/**
 * domain/engine/ecProfile.ts
 * Codex_04 规则引擎 - 错因分布（纯函数实现）
 *
 * 包含：错因（EC 编码）分布统计、主/次错因识别、低信度备注。
 * 所有函数无副作用，输入输出明确。
 */
import { RULES } from '../config/rules';

// ===== 类型定义 =====
export interface ErrorRecord {
  ec_code?: string | null;
  self_mark?: string | null;
  invalid_input?: boolean;
  behavior_tag?: string | null;
}

export interface EcDistributionEntry {
  count: number;
  ratio: number;
}

export interface EcProfile {
  primary?: string;
  secondary?: string;
  distribution: Record<string, EcDistributionEntry>;
  low_confidence_notes: string[];
}

function isExcluded(r: ErrorRecord): boolean {
  return r.self_mark === 'guess' || !!r.invalid_input || r.behavior_tag === 'abandoned';
}

// ===== 错因分布 =====
/**
 * calcEcProfile - 错因分布统计
 *  - 分母 = 已归因错题数（排除 guess/abandoned/invalid_input，且 ec_code 非空）
 *  - 每个 EC 编码占比 = 出现次数 / 分母
 *  - primary = 占比最高且 >= EC_PRIMARY_MIN_RATIO
 *  - secondary = 次高（占比 > 0）
 *  - low_confidence_notes：样本不足 / 存在未归因错题
 */
export function calcEcProfile(errorRecords: ErrorRecord[]): EcProfile {
  const recs = Array.isArray(errorRecords) ? errorRecords : [];
  const attributed = recs.filter((r) => !isExcluded(r) && !!r.ec_code);
  const denom = attributed.length;

  const distribution: Record<string, EcDistributionEntry> = {};
  for (const r of attributed) {
    const code = r.ec_code as string;
    if (!distribution[code]) distribution[code] = { count: 0, ratio: 0 };
    distribution[code].count++;
  }
  for (const code of Object.keys(distribution)) {
    distribution[code].ratio = denom > 0 ? distribution[code].count / denom : 0;
  }

  const entries = Object.entries(distribution).sort(
    (a, b) => b[1].ratio - a[1].ratio || b[1].count - a[1].count,
  );

  let primary: string | undefined;
  if (entries.length > 0 && entries[0][1].ratio >= RULES.EC_PRIMARY_MIN_RATIO) {
    primary = entries[0][0];
  }

  let secondary: string | undefined;
  if (entries.length >= 2 && entries[1][1].ratio > 0) {
    secondary = entries[1][0];
  }

  const notes: string[] = [];
  if (denom < 3) notes.push('有效归因样本不足');
  const unattributed = recs.filter((r) => !isExcluded(r) && !r.ec_code).length;
  if (unattributed > 0) notes.push('存在未归因错题' + unattributed + '题');

  return { primary, secondary, distribution, low_confidence_notes: notes };
}
