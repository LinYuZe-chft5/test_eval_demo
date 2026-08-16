#!/usr/bin/env tsx
/**
 * scripts/clean_latex_seeds.ts
 * 
 * 题库源数据深度清洗脚本
 * 目标：保证三套题库（S1/S3/S6）中，
 *   1) 数学模式内（$...$）：LaTeX 命令正确（带反斜杠）
 *   2) 数学模式外（纯文本、选项、题干前缀）：使用 Unicode 符号，避免出现 \times 等乱码
 *   3) 扫描所有文本字段并列出修复项
 *   4) 输出清洗后的 JSON 到 cleaned/ 目录
 * 
 * 用法：
 *   npx tsx scripts/clean_latex_seeds.ts
 */

import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const DATA_DIR = path.join(cwd, 'scripts', 'data');
const OUT_DIR = path.join(DATA_DIR, 'cleaned');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ===== LaTeX 命令 → Unicode（纯文本区域使用）=====
const CMD_TO_UNI: Array<[RegExp, string]> = [
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
  [/\\\\/g, '  \n'], // 在 Markdown 换行
];

// 扫描的文本字段
const TEXT_FIELDS = [
  'stem', 'solution', 'correct_answer',
  'variant_stem', 'variant_answer',
  'improvement_tip', 'knowledge_point', 'method_name',
  'description', 'prompt', 'text', 'answer',
  'self_mark_tip',
];

/**
 * 清洗一段文本：
 * 把 $...$ / $$...$$ 外的 LaTeX 命令转换为 Unicode；
 * $...$ 内的内容原样保留（不改动）。
 */
function cleanTextSegment(text: string): { result: string; fixes: number } {
  if (!text || typeof text !== 'string') return { result: text, fixes: 0 };
  let fixes = 0;
  const out: string[] = [];
  let rest = text;

  while (rest.length > 0) {
    const block = rest.match(/\$\$([\s\S]+?)\$\$/);
    const inline = rest.match(/\$([^\$\n]+?)\$/);
    const bIdx = block ? rest.indexOf(block[0]) : -1;
    const iIdx = inline ? rest.indexOf(inline[0]) : -1;

    if (block && (iIdx === -1 || bIdx <= iIdx)) {
      if (bIdx > 0) {
        const segment = rest.slice(0, bIdx);
        const cleaned = applyCmdToUni(segment);
        if (cleaned !== segment) fixes++;
        out.push(cleaned);
      }
      out.push(block[0]);
      rest = rest.slice(bIdx + block[0].length);
    } else if (inline) {
      if (iIdx > 0) {
        const segment = rest.slice(0, iIdx);
        const cleaned = applyCmdToUni(segment);
        if (cleaned !== segment) fixes++;
        out.push(cleaned);
      }
      out.push(inline[0]);
      rest = rest.slice(iIdx + inline[0].length);
    } else {
      const cleaned = applyCmdToUni(rest);
      if (cleaned !== rest) fixes++;
      out.push(cleaned);
      rest = '';
    }
  }

  return { result: out.join(''), fixes };
}

function applyCmdToUni(s: string): string {
  let out = s;
  for (const [regex, repl] of CMD_TO_UNI) {
    out = out.replace(regex, repl);
  }
  // 清理孤立的 { }
  out = out.replace(/[{}]/g, '');
  return out;
}

function walkAndClean(obj: any, report: any, qId: string | number, qDay: number | string): void {
  if (!obj) return;
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => {
      if (item && typeof item === 'object') {
        walkAndClean(item, report, `${qId}[${idx}]`, qDay);
      } else if (typeof item === 'string') {
        // 字符串数组元素（少见）
        const { result, fixes } = cleanTextSegment(item);
        if (fixes > 0) {
          obj[idx] = result;
          report.totalFixes += fixes;
          report.detail.push(`Q${qId}/[${idx}]: ${fixes} fixes`);
        }
      }
    });
    return;
  }
  for (const k of Object.keys(obj)) {
    const v = (obj as any)[k];
    if (typeof v === 'string' && TEXT_FIELDS.includes(k)) {
      const { result, fixes } = cleanTextSegment(v);
      if (fixes > 0) {
        (obj as any)[k] = result;
        report.totalFixes += fixes;
        report.detail.push(`Day${qDay} Q${qId} field="${k}": ${fixes} fixes`);
      }
    } else if (v && typeof v === 'object') {
      walkAndClean(v, report, qId, qDay);
    }
  }
}

function cleanFile(inputName: string, skuCode: string): void {
  const inPath = path.join(DATA_DIR, inputName);
  const outPath = path.join(OUT_DIR, inputName);

  console.log(`\n===== 处理 ${inputName} (SKU=${skuCode}) =====`);
  const raw = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  const questions: any[] = raw.questions ?? (Array.isArray(raw) ? raw : []);

  const report = { totalFixes: 0, detail: [] as string[] };
  questions.forEach((q, i) => {
    walkAndClean(q, report, q.id ?? q.qid ?? i, q.day ?? '?');
  });

  console.log(`  总修复数: ${report.totalFixes}`);
  if (report.detail.length > 0) {
    console.log(`  明细（前 15 条）：`);
    report.detail.slice(0, 15).forEach((d: string) => console.log(`   · ${d}`));
    if (report.detail.length > 15) {
      console.log(`   ... 还有 ${report.detail.length - 15} 条`);
    }
  } else {
    console.log(`  数据干净，无需修复 ✅`);
  }

  // 写回
  const outObj = Array.isArray(raw) ? raw : {
    ...raw,
    meta: { ...(raw.meta || {}), sku_code: raw.sku_code || skuCode, cleaned_at: new Date().toISOString() },
    questions,
  };
  fs.writeFileSync(outPath, JSON.stringify(outObj, null, 2), 'utf-8');
  console.log(`  已写出: ${outPath}`);
}

// ===== 主流程 =====
console.log('='.repeat(60));
console.log('🧼 题库 LaTeX 数据清洗工具');
console.log('='.repeat(60));

const FILES: Array<[string, string]> = [
  ['questions_seed.json', 'S1_XIAOSHENGCHU_MATH'],
  ['s3_seed.json', 'S3-01'],
  ['s6_seed.json', 'S6-01'],
];

for (const [fname, sku] of FILES) {
  cleanFile(fname, sku);
}

console.log('\n✅ 清洗完成！输出目录:', OUT_DIR);
console.log('下一步：');
console.log('  1) 在 Supabase SQL Editor 执行清空用户数据的 SQL');
console.log('  2) 在 Codespaces 运行 npm run reimport:cleaned 重新导入清洗后的数据');
console.log('  3) 生成新访问码后再次验收');
