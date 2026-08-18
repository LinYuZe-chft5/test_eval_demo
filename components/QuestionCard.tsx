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

// ===== LaTeX 命令 → Unicode 映射 =====
// 用于：数学模式外的纯文本区域（不经过KaTeX渲染）
// 直接显示Unicode符号，避免看到 \times 这样的乱码
const LATEX_CMD_TO_UNICODE: Array<[RegExp, string]> = [
  [/\\times/g, '×'],
  [/\\div/g, '÷'],
  [/\\pm/g, '±'],
  [/\\mp/g, '∓'],
  [/\\leqq?/g, '≤'],
  [/\\geqq?/g, '≥'],
  [/\\neq/g, '≠'],
  [/\\ne/g, '≠'],
  [/\\cdot/g, '·'],
  [/\\circ/g, '°'],
  [/\\infty/g, '∞'],
  [/\\angle/g, '∠'],
  [/\\perp/g, '⊥'],
  [/\\parallel/g, '∥'],
  [/\\odot/g, '⊙'],
  [/\\triangle/g, '△'],
  [/\\Delta/g, 'Δ'],
  [/\\Leftrightarrow/g, '⇔'],
  [/\\Leftrightarrow/g, '⇔'],
  [/\\leftrightarrow/g, '↔'],
  [/\\Rightarrow/g, '⇒'],
  [/\\rightarrow/g, '→'],
  [/\\Leftarrow/g, '⇐'],
  [/\\leftarrow/g, '←'],
  [/\\alpha/g, 'α'],
  [/\\beta/g, 'β'],
  [/\\gamma/g, 'γ'],
  [/\\delta/g, 'δ'],
  [/\\theta/g, 'θ'],
  [/\\pi/g, 'π'],
  [/\\sqrt/g, '√'],
  [/\\sim/g, '∼'],
  [/\\approx/g, '≈'],
  [/\\because/g, '∵'],
  [/\\therefore/g, '∴'],
  [/\\subseteqq?/g, '⊆'],
  [/\\supseteqq?/g, '⊇'],
  [/\\subset/g, '⊂'],
  [/\\supset/g, '⊃'],
  [/\\cap/g, '∩'],
  [/\\cup/g, '∪'],
  [/\\notin/g, '∉'],
  [/\\in/g, '∈'],
  [/\\forall/g, '∀'],
  [/\\exists/g, '∃'],
  [/\\oplus/g, '⊕'],
  [/\\ominus/g, '⊖'],
  [/\\otimes/g, '⊗'],
  [/\\text\{/g, ''],
  [/\\mathrm\{/g, ''],
  [/\\\\/g, '\n'],
  [/\\,/g, ''],
  [/\\;/g, ''],
  [/\\;/g, ''],
];

/**
 * 把一段纯文本（不含数学模式 $...$）中的 LaTeX 命令转换为 Unicode 符号。
 * 用于处理选项、题干中文本区域，这些内容不会经过 KaTeX 渲染。
 */
function latexCmdsToUnicode(text: string): string {
  let out = text;
  for (const [regex, repl] of LATEX_CMD_TO_UNICODE) {
    out = out.replace(regex, repl);
  }
  // 清理剩余的未配对 { }
  out = out.replace(/[{}]/g, '');
  return out;
}

/**
 * 把数学模式内（$...$ 或 $$...$$）的 LaTeX 命令规范化：
 * - Unicode → LaTeX 命令（保证 KaTeX 能识别）
 * - $后跟无反斜杠的命令 → 补上反斜杠
 * 数学模式区域由调用方（MathText）负责切分后传入。
 */
function normalizeMathMode(math: string): string {
  let result = math;

  // Unicode → LaTeX 命令（安全一对一替换）
  result = result.replace(/×/g, '\\times');
  result = result.replace(/÷/g, '\\div');
  result = result.replace(/±/g, '\\pm');
  result = result.replace(/∓/g, '\\mp');
  result = result.replace(/≤/g, '\\leq');
  result = result.replace(/≥/g, '\\geq');
  result = result.replace(/≠/g, '\\neq');
  result = result.replace(/·/g, '\\cdot');
  result = result.replace(/°/g, '\\circ');
  result = result.replace(/∞/g, '\\infty');
  result = result.replace(/∠/g, '\\angle');
  result = result.replace(/⊥/g, '\\perp');
  result = result.replace(/∥/g, '\\parallel');
  result = result.replace(/⊙/g, '\\odot');
  result = result.replace(/△/g, '\\triangle');
  result = result.replace(/Δ/g, '\\Delta');
  result = result.replace(/α/g, '\\alpha');
  result = result.replace(/β/g, '\\beta');
  result = result.replace(/γ/g, '\\gamma');
  result = result.replace(/δ/g, '\\delta');
  result = result.replace(/θ/g, '\\theta');
  result = result.replace(/π/g, '\\pi');
  result = result.replace(/∵/g, '\\because');
  result = result.replace(/∴/g, '\\therefore');
  result = result.replace(/√/g, '\\sqrt');
  result = result.replace(/∼/g, '\\sim');
  result = result.replace(/≈/g, '\\approx');
  result = result.replace(/⇔/g, '\\Leftrightarrow');
  result = result.replace(/↔/g, '\\leftrightarrow');
  result = result.replace(/⇒/g, '\\Rightarrow');
  result = result.replace(/→/g, '\\rightarrow');

  // $后跟命令补反斜杠（按长度排序避免短命令先匹配）
  const DOLLAR_COMMANDS = [
    'triangle', 'angle', 'parallel', 'perp', 'odot',
    'sqrt', 'frac', 'times', 'div', 'cdot',
    'sin', 'cos', 'tan', 'log', 'ln',
    'alpha', 'beta', 'gamma', 'delta', 'theta', 'pi',
    'leq', 'geq', 'neq', 'sim', 'approx',
    'infty', 'circ', 'pm', 'mp',
    'overline', 'underline', 'vec', 'hat', 'bar',
    'begin', 'end', 'array', 'left', 'right',
    'sum', 'prod', 'min', 'max',
    'subset', 'subseteq', 'supset',
    'forall', 'exists', 'notin',
    'mapsto', 'leftarrow', 'rightarrow',
    'odot', 'otimes', 'oplus',
    'quad', 'qquad',
    'because', 'therefore',
  ].sort((a, b) => b.length - a.length);

  for (const cmd of DOLLAR_COMMANDS) {
    const escapedCmd = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\$${escapedCmd}(?=[{\\s0-9,.;!?]|$)`, 'g');
    result = result.replace(regex, `$\\${cmd}`);
  }

  // ^ 或 _ 后跟命令补反斜杠
  const SUPER_SUB_COMMANDS = ['times', 'div', 'cdot', 'frac', 'sqrt', 'pm'];
  for (const cmd of SUPER_SUB_COMMANDS) {
    const escapedCmd = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexSuper = new RegExp(`\\^${escapedCmd}(?=[{\\s0-9]|$)`, 'g');
    result = result.replace(regexSuper, `^\\${cmd}`);
    const regexSub = new RegExp(`_${escapedCmd}(?=[{\\s0-9]|$)`, 'g');
    result = result.replace(regexSub, `_\\${cmd}`);
  }

  return result;
}

// ===== 数学公式文本渲染 =====
/** 
 * 将含 $$...$$ 与 $...$ 的文本切分为段并渲染。
 * 关键区分：
 * - 数学模式内（$...$）：交给 KaTeX，用 normalizeMathMode() 规范化命令
 * - 数学模式外（纯文本）：不经过KaTeX，直接把 \times 等命令转换为 Unicode 符号显示
 */
export function MathText({ text }: { text: string }) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let rest = String(text);
  let key = 0;

  while (rest.length > 0) {
    // 块级 $$...$$
    const block = rest.match(/\$\$([\s\S]+?)\$\$/);
    // 行内 $...$
    const inline = rest.match(/\$([^\$\n]+?)\$/);
    const blockIdx = block ? rest.indexOf(block[0]) : -1;
    const inlineIdx = inline ? rest.indexOf(inline[0]) : -1;

    if (block && (inlineIdx === -1 || blockIdx <= inlineIdx)) {
      if (blockIdx > 0) {
        // 块前面的纯文本区域 → 用 latexCmdsToUnicode（不经过KaTeX渲染）
        parts.push(<span key={key++}>{latexCmdsToUnicode(rest.slice(0, blockIdx))}</span>);
      }
      parts.push(<BlockMath key={key++} math={normalizeMathMode(block[1])} />);
      rest = rest.slice(blockIdx + block[0].length);
    } else if (inline) {
      if (inlineIdx > 0) {
        // 行内公式前面的纯文本区域 → 用 latexCmdsToUnicode
        parts.push(<span key={key++}>{latexCmdsToUnicode(rest.slice(0, inlineIdx))}</span>);
      }
      parts.push(<InlineMath key={key++} math={normalizeMathMode(inline[1])} />);
      rest = rest.slice(inlineIdx + inline[0].length);
    } else {
      // 剩余纯文本 → latexCmdsToUnicode
      parts.push(<span key={key++}>{latexCmdsToUnicode(rest)}</span>);
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
        <textarea
          inputMode="text"
          disabled={readOnly}
          value={value.fill ?? ''}
          onChange={(e) => handleFill(e.target.value)}
          onInput={(e) => {
            const textarea = e.target as HTMLTextAreaElement;
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
          }}
          placeholder="请输入答案"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none disabled:bg-gray-50 min-h-[44px] resize-none overflow-hidden"
          rows={1}
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
              <textarea
                disabled={readOnly}
                value={value.step?.[s.seq] ?? ''}
                onChange={(e) => handleStep(s.seq, e.target.value)}
                onInput={(e) => {
                  const textarea = e.target as HTMLTextAreaElement;
                  textarea.style.height = 'auto';
                  textarea.style.height = `${textarea.scrollHeight}px`;
                }}
                placeholder="请输入该步答案"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none disabled:bg-gray-50 min-h-[44px] resize-none overflow-hidden"
                rows={1}
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
