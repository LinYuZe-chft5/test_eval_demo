/**
 * lib/katex.ts
 * KaTeX 渲染工具 —— 服务端将数学公式渲染为 HTML 字符串。
 *
 * 支持 $$...$$（块级）与 $...$（行内）语法。
 * 用于报告页等 Server Component 中预渲染数学公式。
 */
import katex from 'katex';

/** 渲染单段 LaTeX 为 HTML 字符串。 */
export function renderKatexToString(latex: string, displayMode = false): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: 'html',
    });
  } catch {
    return latex;
  }
}

/**
 * 将文本中的 $$...$$ 与 $...$ 替换为 KaTeX 渲染后的 HTML。
 * - $$...$$ 渲染为块级公式
 * - $...$ 渲染为行内公式
 * 转义顺序：先处理块级，再处理行内，避免误吞。
 */
export function renderInlineMath(text: string): string {
  if (!text) return '';
  let out = String(text);

  // 块级 $$...$$
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_m, latex: string) =>
    renderKatexToString(latex, true),
  );

  // 行内 $...$（避免匹配空串与跨段）
  out = out.replace(/\$([^\$\n]+?)\$/g, (_m, latex: string) =>
    renderKatexToString(latex, false),
  );

  return out;
}
