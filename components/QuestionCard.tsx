'use client';

/**
 * components/QuestionCard.tsx
 * 题目卡片组件 —— 按 q_type（choice/fill/step）渲染不同作答界面。
 * 所有类型支持 KaTeX 公式渲染；交互时采集行为事件（带 timestamp）。
 * 回翻只读模式下仅展示题干与作答，不可修改。
 */
import { useEffect, useRef, memo } from 'react';
import { InlineMath, BlockMath } from 'react-katex';

// ===== 事件类型 =====
export interface AnswerEvent {
  type:
    | 'enter'
    | 'click'
    | 'option_select'
    | 'option_change'
    | 'fill'
    | 'step'
    | 'submit'
    | 'screen_leave'
    | 'screen_enter'
    | 'revisit';
  ts: number;
  key?: string;
  value?: string;
  seq?: number;
  self_mark?: string | null;
}

export interface ChoiceOption {
  key: string;
  text: string;
  ec_code?: string | null;
}

export interface StepItem {
  seq: number;
  prompt: string;
}

export interface QuestionData {
  id: string;
  q_type: 'choice' | 'fill' | 'step';
  stem: string;
  options?: ChoiceOption[] | null;
  steps?: StepItem[] | null;
  score?: number;
}

export interface QuestionValue {
  /** choice: 选项 key；fill: 字符串；step: { [seq]: string } */
  choice?: string;
  fill?: string;
  step?: Record<number, string>;
}

interface Props {
  question: QuestionData;
  index: number;
  total: number;
  value: QuestionValue;
  readOnly?: boolean;
  selfMark?: string | null;
  onEvent?: (e: AnswerEvent) => void;
  onChange?: (v: QuestionValue) => void;
  onSelfMark?: (mark: string | null) => void;
}

// ===== LaTeX 反斜杠修复 =====
function fixLatexBackslashes(text: string): string {
  if (!text) return text;
  let result = text;

  // 1. Unicode 数学符号 → LaTeX 命令
  result = result.replace(/×/g, '\\times');
  result = result.replace(/÷/g, '\\div');
  result = result.replace(/±/g, '\\pm');
  result = result.replace(/≤/g, '\\leq');
  result = result.replace(/≥/g, '\\geq');
  result = result.replace(/≠/g, '\\neq');
  result = result.replace(/·/g, '\\cdot');
  result = result.replace(/°/g, '\\circ');
  result = result.replace(/∞/g, '\\infty');
  result = result.replace(/∠/g, '\\angle');
  result = result.replace(/⊥/g, '\\perp');
  result = result.replace(/α/g, '\\alpha');
  result = result.replace(/β/g, '\\beta');
  result = result.replace(/γ/g, '\\gamma');
  result = result.replace(/δ/g, '\\delta');
  result = result.replace(/θ/g, '\\theta');
  result = result.replace(/π/g, '\\pi');
  result = result.replace(/σ/g, '\\sigma');
  result = result.replace(/λ/g, '\\lambda');
  result = result.replace(/μ/g, '\\mu');
  result = result.replace(/△/g, '\\triangle');

  // 2. 修复被转义吞掉的反斜杠：LaTeX命令前缀
  // 这些命令如果丢失了反斜杠，会导致渲染异常
  const COMMANDS = [
    'frac', 'sqrt', 'times', 'div', 'pm', 'mp',
    'circ', 'leq', 'geq', 'neq', 'sim', 'approx',
    'sum', 'min', 'max', 'prod',
    'cdot', 'cdots', 'ldots', 'dots',
    'overline', 'underline', 'vec', 'hat', 'bar', 'dot',
    'left', 'right', 'middle',
    'begin', 'end', 'array', 'hline', 'vspace', 'hspace',
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta',
    'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu',
    'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau',
    'upsilon', 'phi', 'chi', 'psi', 'omega',
    'triangle', 'angle', 'perp', 'parallel', 'infty',
    'forall', 'exists', 'notin', 'subset', 'subseteq',
    'supset', 'cup', 'cap', 'emptyset',
    'ast', 'star',
    'oplus', 'ominus', 'otimes', 'oslash',
    'nthroot',
    'to', 'leftarrow', 'rightarrow', 'Rightarrow', 'Leftarrow',
    'mapsto', 'longmapsto', 'uparrow', 'downarrow',
    'ne', 'cong', 'simeq',
    'le', 'ge', 'll', 'gg',
    'sin', 'cos', 'tan', 'log', 'ln',
    'setminus', 'backslash',
    'quad', 'qquad', 'space',
    '!', 'W', 'w', 'R', 'Z', 'N',
    'infty', 'aleph', 'beth',
    'hbar', 'ell', 'wp', 'weierp',
    'Re', 'Im', 'hbar',
  ];

  // 为每个命令添加反斜杠（如果前面没有）
  for (const cmd of COMMANDS) {
    if (!cmd) continue;
    // 匹配前面没有反斜杠的命令，后面跟 { [ 空格 数字 标点 或结尾
    const escapedCmd = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!\\\\)${escapedCmd}(?=[{[\\s0-9,.;!?]|$)`, 'g');
    result = result.replace(regex, `\\${cmd}`);
  }

  // 3. 特殊处理：^后直接跟命令的情况（如 ^2\times3）
  for (const cmd of ['times', 'div', 'pm', 'cdot', 'frac', 'sqrt', 'sin', 'cos', 'tan', 'log', 'ln']) {
    const regex = new RegExp(`\\^${cmd}(?=[{[\\s0-9]|$)`, 'g');
    result = result.replace(regex, `^\\${cmd}`);
  }

  // 4. 特殊处理：_后直接跟命令的情况（如 _2\times3）
  for (const cmd of ['times', 'div', 'pm', 'cdot', 'frac', 'sqrt']) {
    const regex = new RegExp(`_${cmd}(?=[{[\\s0-9]|$)`, 'g');
    result = result.replace(regex, `_\\${cmd}`);
  }

  // 5. 修复常见的反斜杠丢失模式
  // 如：$imes$ → $\times$（检测到imes前面是$且没有反斜杠）
  result = result.replace(/\$times/g, '$\\times');
  result = result.replace(/\$frac/g, '$\\frac');
  result = result.replace(/\$sqrt/g, '$\\sqrt');
  result = result.replace(/\$div/g, '$\\div');
  result = result.replace(/\$cdot/g, '$\\cdot');
  result = result.replace(/\$angle/g, '$\\angle');
  result = result.replace(/\$parallel/g, '$\\parallel');
  result = result.replace(/\$perp/g, '$\\perp');
  result = result.replace(/\$triangle/g, '$\\triangle');
  result = result.replace(/\$circ/g, '$\\circ');
  result = result.replace(/\$infty/g, '$\\infty');
  result = result.replace(/\$alpha/g, '$\\alpha');
  result = result.replace(/\$beta/g, '$\\beta');
  result = result.replace(/\$gamma/g, '$\\gamma');
  result = result.replace(/\$delta/g, '$\\delta');
  result = result.replace(/\$theta/g, '$\\theta');
  result = result.replace(/\$pi/g, '$\\pi');
  result = result.replace(/\$sigma/g, '$\\sigma');
  result = result.replace(/\$lambda/g, '$\\lambda');
  result = result.replace(/\$mu/g, '$\\mu');
  result = result.replace(/\$leq/g, '$\\leq');
  result = result.replace(/\$geq/g, '$\\geq');
  result = result.replace(/\$neq/g, '$\\neq');

  // 6. 修复\begin{cases}等环境命令
  result = result.replace(/\$begin\{/g, '$\\begin{');
  result = result.replace(/\\\\begin\{/g, '\\\\begin{');

  return result;
}

// ===== 数学公式文本渲染 =====
/** 将含 $$...$$ 与 $...$ 的文本切分为段并渲染。 */
export function MathText({ text }: { text: string }) {
  if (!text) return null;
  const fixedText = fixLatexBackslashes(text);
  const parts: React.ReactNode[] = [];
  let rest = String(fixedText);
  let key = 0;

  while (rest.length > 0) {
    // 块级 $$...$$
    const block = rest.match(/\$\$([\s\S]+?)\$\$/);
    // 行内 $...$
    const inline = rest.match(/\$([^\$\n]+?)\$/);
    const blockIdx = block ? rest.indexOf(block[0]) : -1;
    const inlineIdx = inline ? rest.indexOf(inline[0]) : -1;

    if (block && (inlineIdx === -1 || blockIdx <= inlineIdx)) {
      if (blockIdx > 0) parts.push(<span key={key++}>{rest.slice(0, blockIdx)}</span>);
      parts.push(<BlockMath key={key++} math={block[1]} />);
      rest = rest.slice(blockIdx + block[0].length);
    } else if (inline) {
      if (inlineIdx > 0) parts.push(<span key={key++}>{rest.slice(0, inlineIdx)}</span>);
      parts.push(<InlineMath key={key++} math={inline[1]} />);
      rest = rest.slice(inlineIdx + inline[0].length);
    } else {
      parts.push(<span key={key++}>{rest}</span>);
      rest = '';
    }
  }
  return <>{parts}</>;
}

// ===== 主组件 =====
function QuestionCardBase({
  question,
  index,
  total,
  value,
  readOnly = false,
  selfMark = null,
  onEvent,
  onChange,
  onSelfMark,
}: Props) {
  const enteredRef = useRef(false);

  // 进入题目：记录 enter 事件（仅一次）
  useEffect(() => {
    if (!enteredRef.current) {
      enteredRef.current = true;
      onEvent?.({ type: 'enter', ts: Date.now() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  const now = () => Date.now();

  // ---- 选择题 ----
  const handleSelect = (key: string) => {
    if (readOnly) return;
    const prev = value.choice;
    onEvent?.({
      type: prev == null ? 'option_select' : 'option_change',
      ts: now(),
      key,
    });
    onChange?.({ ...value, choice: key });
  };

  // ---- 填空题 ----
  const handleFill = (v: string) => {
    if (readOnly) return;
    onEvent?.({ type: 'fill', ts: now(), value: v });
    onChange?.({ ...value, fill: v });
  };

  // ---- 分步题 ----
  const handleStep = (seq: number, v: string) => {
    if (readOnly) return;
    onEvent?.({ type: 'step', ts: now(), seq, value: v });
    onChange?.({ ...value, step: { ...(value.step ?? {}), [seq]: v } });
  };

  const toggleSelfMark = () => {
    const next = selfMark === 'guess' ? null : 'guess';
    onEvent?.({ type: 'click', ts: now(), self_mark: next });
    onSelfMark?.(next);
  };

  return (
    <section className="bg-white rounded-xl shadow-sm p-4 space-y-4">
      {/* 顶部进度 */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          第 {index + 1} 题 / 共 {total} 题
        </span>
        {typeof question.score === 'number' && <span>分值 {question.score} 分</span>}
      </div>

      {/* 题干 */}
      <div className="text-base leading-relaxed text-gray-900 no-select">
        <MathText text={question.stem} />
      </div>

      {/* 作答区 */}
      {question.q_type === 'choice' && (
        <ul className="space-y-2">
          {(question.options ?? []).map((opt) => {
            const checked = value.choice === opt.key;
            return (
              <li key={opt.key}>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => handleSelect(opt.key)}
                  className={`w-full text-left flex items-start gap-2 rounded-lg border px-3 py-2 transition ${
                    checked
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white'
                  } ${readOnly ? 'cursor-default opacity-80' : 'active:scale-[0.99]'}`}
                >
                  <span className="font-semibold text-blue-600 shrink-0">{opt.key}.</span>
                  <span className="flex-1">
                    <MathText text={opt.text} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {question.q_type === 'fill' && (
        <input
          type="text"
          inputMode="text"
          disabled={readOnly}
          value={value.fill ?? ''}
          onChange={(e) => handleFill(e.target.value)}
          placeholder="请输入答案"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
        />
      )}

      {question.q_type === 'step' && (
        <ol className="space-y-3">
          {(question.steps ?? []).map((s) => (
            <li key={s.seq} className="space-y-1">
              <div className="text-sm text-gray-700">
                <span className="font-semibold mr-1">({s.seq})</span>
                <MathText text={s.prompt} />
              </div>
              <input
                type="text"
                disabled={readOnly}
                value={value.step?.[s.seq] ?? ''}
                onChange={(e) => handleStep(s.seq, e.target.value)}
                placeholder="请输入该步答案"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
              />
            </li>
          ))}
        </ol>
      )}

      {/* 自我标记 */}
      {!readOnly && (
        <div className="pt-1">
          <button
            type="button"
            onClick={toggleSelfMark}
            className={`text-xs px-3 py-1 rounded-full border transition ${
              selfMark === 'guess'
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-gray-300 text-gray-500'
            }`}
          >
            {selfMark === 'guess' ? '✓ 我猜的（已标记）' : '标记：我猜的'}
          </button>
        </div>
      )}

      {/* 只读模式提示 */}
      {readOnly && (
        <p className="text-xs text-gray-400">本题已作答，仅可查看不可修改。</p>
      )}
    </section>
  );
}

export const QuestionCard = memo(QuestionCardBase);
