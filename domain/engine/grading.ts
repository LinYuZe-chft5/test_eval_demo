/**
 * domain/engine/grading.ts
 * Codex_04 规则引擎 - 判分规则（纯函数实现）
 *
 * 包含：选择题判分、填空题答案规范化与判分、分步题判分。
 * 所有函数无副作用，输入输出明确，禁止跨 form 的“智能等价”。
 */
import { RULES } from '../config/rules';

// ===== 类型定义 =====
export type AcceptForm = 'fraction' | 'decimal';

export interface AnswerSpec {
  accept_forms: AcceptForm[];
  decimal_tolerance?: number;
  allow_pi?: boolean;
  unit?: string;
}

export interface Option {
  key: string;
  text: string;
  ec_code?: string;
}

export interface StepDef {
  seq: number;
  prompt: string;
  answer: string;
  answer_spec?: AnswerSpec;
  score: number;
}

export interface StepAnswer {
  seq: number;
  answer: string;
}

type Rational = { num: number; den: number };
type NormalizedValue = number | Rational;

export type NormalizeResult =
  | { ok: true; value: NormalizedValue }
  | { ok: false; invalid: true };

export interface FillResult {
  is_correct: boolean;
  invalid_input: boolean;
}

export interface StepResult {
  seq: number;
  is_correct: boolean;
  score: number;
}

export interface StepsResult {
  total_score: number;
  step_results: StepResult[];
}

// ===== 内部工具 =====
function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
}

function reduceFraction(num: number, den: number): Rational | null {
  if (den === 0) return null;
  const g = gcd(num, den);
  let n = num / g;
  let d = den / g;
  if (d < 0) {
    n = -n;
    d = -d;
  }
  return { num: n, den: d };
}

/** 全角字符转半角（含全角空格） */
function toHalfWidth(s: string): string {
  return s
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

function numberToRational(n: number): Rational {
  if (!isFinite(n) || Number.isInteger(n)) {
    return { num: n, den: 1 };
  }
  const s = String(n);
  if (s.includes('e') || s.includes('E')) {
    return { num: n, den: 1 };
  }
  const dotIdx = s.indexOf('.');
  const decimals = s.length - dotIdx - 1;
  const den = Math.pow(10, decimals);
  const num = Math.round(n * den);
  return reduceFraction(num, den) ?? { num: n, den: 1 };
}

function toRational(v: NormalizedValue): Rational {
  if (typeof v === 'number') return numberToRational(v);
  return reduceFraction(v.num, v.den) ?? { num: v.num, den: v.den };
}

function toNumber(v: NormalizedValue): number {
  if (typeof v === 'number') return v;
  return v.num / v.den;
}

function rationalEqual(a: NormalizedValue, b: NormalizedValue): boolean {
  const ra = toRational(a);
  const rb = toRational(b);
  return ra.num === rb.num && ra.den === rb.den;
}

function parseNumber(s: string): number | null {
  if (s === '') return null;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** 反复剥离最外层配平的括号：(-3) -> -3，((3)) -> 3 */
function stripOuterParens(s: string): string {
  let cur = s;
  while (cur.length >= 2 && cur[0] === '(' && cur[cur.length - 1] === ')') {
    let depth = 0;
    let balanced = true;
    for (let i = 1; i < cur.length - 1; i++) {
      if (cur[i] === '(') depth++;
      else if (cur[i] === ')') {
        depth--;
        if (depth < 0) {
          balanced = false;
          break;
        }
      }
    }
    if (balanced && depth === 0) {
      cur = cur.slice(1, -1);
    } else {
      break;
    }
  }
  return cur;
}

// ===== 选择题 =====
/** 选择题精确匹配：转大写后比对 */
export function gradeChoice(studentKey: string, correctKey: string): boolean {
  if (studentKey == null || correctKey == null) return false;
  return String(studentKey).trim().toUpperCase() === String(correctKey).trim().toUpperCase();
}

/** 选择题错因归因：返回学生所选项的 ec_code */
export function getChoiceEcCode(studentKey: string, options: Option[]): string | null {
  if (!Array.isArray(options) || studentKey == null) return null;
  const key = String(studentKey).trim().toUpperCase();
  const opt = options.find((o) => String(o.key).trim().toUpperCase() === key);
  return opt?.ec_code ?? null;
}

// ===== 填空题规范化 =====
/**
 * 填空题答案规范化
 * - trim；全角转半角；去除内部空格
 * - 分数 a/b（整数时按有理数保留）
 * - π 处理：allow_pi=true 接受 π/pi/3.14（可选符号）；allow_pi=false 含 π 判 INVALID
 * - 负数/括号等价：(-3) ≡ -3
 * - 无法解析 => INVALID
 */
export function normalize(raw: string, answerSpec?: AnswerSpec): NormalizeResult {
  if (raw == null) return { ok: false, invalid: true };
  let s = toHalfWidth(String(raw)).trim().replace(/\s+/g, '');
  if (s === '') return { ok: false, invalid: true };

  // 单位剥离
  if (answerSpec?.unit) {
    const u = toHalfWidth(answerSpec.unit).trim();
    if (u && s.endsWith(u)) {
      s = s.slice(0, s.length - u.length);
    }
  }
  if (s === '') return { ok: false, invalid: true };

  const allowPi = !!answerSpec?.allow_pi;
  const piToken = Math.PI;

  if (allowPi) {
    // 纯 π / pi / 3.14 形式（可选符号）
    const m = s.match(/^([-+]?)(π|pi|3\.14)$/i);
    if (m) {
      const sign = m[1] === '-' ? -1 : 1;
      return { ok: true, value: sign * piToken };
    }
    // 含 π 的复合形式：替换为 Math.PI 后按数值解析
    if (/π/i.test(s) || /\bpi\b/i.test(s)) {
      const replaced = s
        .replace(/π/gi, String(piToken))
        .replace(/\bpi\b/gi, String(piToken));
      const num = parseNumber(replaced);
      if (num === null) return { ok: false, invalid: true };
      return { ok: true, value: num };
    }
  } else {
    // allow_pi=false：含 π 判错（INVALID）
    if (/π/i.test(s) || /\bpi\b/i.test(s)) {
      return { ok: false, invalid: true };
    }
  }

  s = stripOuterParens(s);
  if (s === '') return { ok: false, invalid: true };

  // 分数 a/b
  const fracMatch = s.match(/^([-+]?\d+\.?\d*)\/([-+]?\d+\.?\d*)$/);
  if (fracMatch) {
    const num = parseFloat(fracMatch[1]);
    const den = parseFloat(fracMatch[2]);
    if (isNaN(num) || isNaN(den) || den === 0) return { ok: false, invalid: true };
    if (Number.isInteger(num) && Number.isInteger(den)) {
      const r = reduceFraction(num, den);
      if (!r) return { ok: false, invalid: true };
      return { ok: true, value: r };
    }
    return { ok: true, value: num / den };
  }

  const num = parseNumber(s);
  if (num !== null) {
    return { ok: true, value: num };
  }
  return { ok: false, invalid: true };
}

// ===== 填空题判分 =====
/**
 * 填空题判分：按 answer_spec.accept_forms 判分
 * - fraction：有理数等值比较（约分后相等）
 * - decimal：按 decimal_tolerance 容差比较（|x-std| ≤ tol）
 * - 禁止全局“智能等价”，仅按声明的 form 比较
 */
export function gradeFill(raw: string, correctAnswer: string, spec: AnswerSpec): FillResult {
  const studentNorm = normalize(raw, spec);
  if (!studentNorm.ok) {
    return { is_correct: false, invalid_input: true };
  }
  const correctNorm = normalize(correctAnswer, spec);
  if (!correctNorm.ok) {
    // 标准答案无法解析视为题库数据异常，判错但不计 invalid_input
    return { is_correct: false, invalid_input: false };
  }
  const forms: AcceptForm[] =
    spec.accept_forms && spec.accept_forms.length > 0 ? spec.accept_forms : ['decimal'];
  const tol = typeof spec.decimal_tolerance === 'number' ? spec.decimal_tolerance : 0;

  for (const form of forms) {
    if (form === 'fraction') {
      if (rationalEqual(studentNorm.value, correctNorm.value)) {
        return { is_correct: true, invalid_input: false };
      }
    } else if (form === 'decimal') {
      const diff = Math.abs(toNumber(studentNorm.value) - toNumber(correctNorm.value));
      if (diff <= tol + 1e-12) {
        return { is_correct: true, invalid_input: false };
      }
    }
  }
  return { is_correct: false, invalid_input: false };
}

// ===== 分步题判分 =====
/** 分步题单步判分 */
export function gradeStep(stepAnswer: string, stepDef: StepDef): { is_correct: boolean; score: number } {
  if (stepDef.answer_spec) {
    const r = gradeFill(stepAnswer, stepDef.answer, stepDef.answer_spec);
    return { is_correct: r.is_correct, score: r.is_correct ? stepDef.score : 0 };
  }
  // 无 spec：精确字符串比对（trim + 全角转半角）
  const a = toHalfWidth(String(stepAnswer ?? '')).trim();
  const b = toHalfWidth(String(stepDef.answer ?? '')).trim();
  const isCorrect = a === b;
  return { is_correct: isCorrect, score: isCorrect ? stepDef.score : 0 };
}

/** 分步题总分：各步独立判分，按 seq 匹配 */
export function gradeSteps(stepAnswers: StepAnswer[], stepDefs: StepDef[]): StepsResult {
  const map = new Map<number, string>();
  for (const sa of stepAnswers ?? []) {
    map.set(sa.seq, sa.answer);
  }
  let totalScore = 0;
  const results: StepResult[] = [];
  for (const def of stepDefs ?? []) {
    const ans = map.has(def.seq) ? (map.get(def.seq) as string) : '';
    const r = gradeStep(ans, def);
    totalScore += r.score;
    results.push({ seq: def.seq, is_correct: r.is_correct, score: r.score });
  }
  return { total_score: totalScore, step_results: results };
}

/** 规则常量引用入口（本模块当前判分阈值取自 AnswerSpec，常量管理统一走 RULES） */
export const GRADING_RULES = RULES;
