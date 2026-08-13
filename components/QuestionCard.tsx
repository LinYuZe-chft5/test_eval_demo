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

// ===== 数学公式文本渲染 =====
/** 将含 $$...$$ 与 $...$ 的文本切分为段并渲染。 */
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
