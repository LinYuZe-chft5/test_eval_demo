#!/bin/bash
# 直接覆盖报告页文件（绕过 git）
# 在 Codespaces 终端执行: bash scripts/force_fix_report.sh

cd /workspace/test_eval_demo

echo "=== 直接覆盖报告页 ==="

cat > app/report/page.tsx << 'ENDOFFILE'
/**
 * app/report/page.tsx
 * 诊断报告页 v3 —— 所有逻辑移至 lib/report-utils.ts
 */
import { prisma } from '@/lib/prisma';
import { renderInlineMath } from '@/lib/katex';
import RadarChart, { type RadarDatum } from '@/components/RadarChart';
import { hasLowCredibility, buildFallbackNarrative } from '@/lib/report-utils';
import type { ReportDraft } from '@/domain/engine/reportBuilder';
import type { MasteryLevel } from '@/domain/engine/mastery';

interface PageProps {
  searchParams: { student_id?: string };
}

const LEVEL_TEXT: Record<MasteryLevel, string> = {
  green: '掌握良好',
  yellow: '基本掌握',
  red: '待加强',
};
const LEVEL_COLOR: Record<MasteryLevel, string> = {
  green: 'text-green-600',
  yellow: 'text-amber-600',
  red: 'text-red-600',
};
const ADAPT_TEXT: Record<string, string> = {
  pass: '达标',
  basic: '基本达标',
  weak: '待加强',
};
const ADAPT_COLOR: Record<string, string> = {
  pass: 'text-green-600',
  basic: 'text-amber-600',
  weak: 'text-red-600',
};

export default async function ReportPage({ searchParams }: PageProps) {
  const studentId = searchParams.student_id;

  if (!studentId) {
    return <EmptyReport message="缺少学生标识，无法查看报告。" />;
  }

  const row = await (prisma as any).reportDrafts.findFirst({
    where: { studentId: Number(studentId) },
    orderBy: { createdAt: 'desc' },
  });

  if (!row) {
    return (
      <EmptyReport message="报告尚未生成。请完成全部三天诊断后再查看。" />
    );
  }

  const draft: ReportDraft = row.degradedTexts ? (row.degradedTexts as ReportDraft) : {
    total_score: row.totalScore ?? 0,
    adaptive_level: row.adaptiveLevel ?? 'weak',
    module_mastery: row.moduleMastery ?? {},
    literacy_radar: row.literacyRadar ?? {},
    ec_profile: row.ecProfile ?? { primary: undefined, secondary: undefined, distribution: {}, low_confidence_notes: [] },
    confidence_flags: row.confidenceFlags ?? [],
    plan_4week: row.plan4week ?? [],
    action_checklist: row.actionChecklist ?? [],
    narrative_text: row.narrativeText ?? '',
    degraded_texts: [],
  };

  const kpRows: any[] = await (prisma as any).kpDependencies.findMany({
    select: 'kpCode,module',
  });
  const kpModule = new Map<string, string>();
  for (const r of kpRows) {
    const kp = r.kp_code ?? r.kpCode;
    if (kp) kpModule.set(kp, r.module);
  }

  const moduleAgg: Record<string, { sum: number; count: number; level: MasteryLevel }> = {};
  const masteryEntries = Object.entries(draft.module_mastery ?? {});
  for (const [kp, entry] of masteryEntries) {
    const mod = kpModule.get(kp) ?? '其他';
    if (!moduleAgg[mod]) moduleAgg[mod] = { sum: 0, count: 0, level: 'red' };
    const masteryValue = Number(entry.mastery_score);
    if (!isNaN(masteryValue) && isFinite(masteryValue)) {
      moduleAgg[mod].sum += masteryValue;
      moduleAgg[mod].count += 1;
    }
  }
  const moduleList: { module: string; score: number; level: MasteryLevel }[] = [];
  for (const [mod, v] of Object.entries(moduleAgg)) {
    const avg = v.count > 0 ? v.sum / v.count : 0;
    let level: MasteryLevel = 'red';
    if (avg >= 0.8) level = 'green';
    else if (avg >= 0.5) level = 'yellow';
    moduleList.push({ module: mod, score: avg, level });
  }

  const radarRaw = Object.entries(draft.literacy_radar ?? {});
  const radarData: RadarDatum[] = [];
  const seenDims = new Set<string>();
  for (const [dim, v] of radarRaw) {
    if (seenDims.has(dim)) continue;
    seenDims.add(dim);
    radarData.push({ dimension: dim, value: (v as any).score });
  }

  const lowCredibility = hasLowCredibility(draft.confidence_flags);

  return (
    <main className="min-h-screen px-4 py-6 space-y-4">
      <header className="text-center pt-2 pb-2">
        <h1 className="text-xl font-bold">诊断报告</h1>
        <p className="text-xs text-gray-400 mt-1">学生标识：{studentId}</p>
      </header>

      {lowCredibility && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          ⚠️ 本次答卷存在低信度信号，结论仅供参考，建议复测。
        </div>
      )}

      <Section title="适应性评定">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">综合评定</span>
          <span className={`text-lg font-bold ${ADAPT_COLOR[draft.adaptive_level] ?? 'text-gray-600'}`}>
            {ADAPT_TEXT[draft.adaptive_level] ?? draft.adaptive_level}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm text-gray-600">总分</span>
          <span className="text-lg font-bold text-blue-600">{draft.total_score} 分</span>
        </div>
      </Section>

      <Section title="模块掌握度">
        {moduleList.length === 0 ? (
          <p className="text-xs text-gray-400">暂无模块数据</p>
        ) : (
          <ul className="space-y-2">
            {moduleList.map((m) => {
              const displayPercent = !isNaN(m.score) && isFinite(m.score)
                ? Math.round(m.score * 100)
                : 0;
              return (
                <li key={m.module} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{m.module}</span>
                    <span className={`font-medium ${LEVEL_COLOR[m.level]}`}>
                      {LEVEL_TEXT[m.level]}（{displayPercent}%）
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-200">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${displayPercent}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="素养雷达图">
        {radarData.length > 0 ? (
          <RadarChart data={radarData} max={1} />
        ) : (
          <p className="text-xs text-gray-400">暂无素养数据</p>
        )}
      </Section>

      <Section title="首要错因及改进建议">
        {draft.ec_profile?.primary ? (
          <div className="space-y-1 text-sm">
            <p>
              首要错因：
              <span className="font-semibold text-red-600">{draft.ec_profile.primary}</span>
            </p>
            {draft.ec_profile.secondary && (
              <p className="text-gray-500">次要错因：{draft.ec_profile.secondary}</p>
            )}
            {draft.ec_profile.low_confidence_notes?.length > 0 && (
              <p className="text-xs text-gray-400">{draft.ec_profile.low_confidence_notes.join('；')}</p>
            )}
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <p className="text-amber-600 font-medium">暂无显著归因错因</p>
            <p className="text-xs text-gray-500">
              可能原因：错题样本不足、多选题分散错因、或学生整体发挥较为稳定。
              建议关注错题涉及的知识点进行综合复习。
            </p>
            {draft.action_checklist?.length > 0 && (
              <p className="text-xs text-gray-500">
                已为您生成 {draft.action_checklist.length} 项改进行动清单，详见下方行动清单部分。
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="4周干预计划">
        {draft.plan_4week?.length ? (
          <ol className="space-y-2">
            {draft.plan_4week.map((w) => {
              const focusKp = w.focus_kps?.length
                ? w.focus_kps.join('、')
                : '综合复习（重点补强薄弱考点）';
              return (
                <li key={w.week} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                  <div className="text-sm font-medium text-gray-800">第 {w.week} 周</div>
                  <div className="text-xs text-gray-500 mt-0.5">焦点考点：{focusKp}</div>
                  {w.method_cards?.length > 0 && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      方法卡：{w.method_cards.map((c) => c.title ?? c.id).join('、')}
                    </div>
                  )}
                  {w.questions?.length > 0 && (
                    <div className="text-xs text-gray-500 mt-0.5">练习题：{w.questions.length} 道</div>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-xs text-gray-400">暂无干预计划</p>
        )}
      </Section>

      {draft.action_checklist?.length > 0 && (
        <Section title="行动清单">
          <ul className="space-y-1.5 text-sm">
            {draft.action_checklist.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">•</span>
                <span className="text-gray-700">{a.action}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {draft.confidence_flags?.length > 0 && (
        <Section title="置信度标记">
          <ul className="space-y-1 text-xs text-gray-600">
            {draft.confidence_flags.map((f, i) => (
              <li key={i}>题目 {f.question_id}：{f.flag}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="诊断综述">
        <NarrativeParagraph draft={draft} />
      </Section>

      <div className="pt-2 pb-6 text-center">
        <a href="/" className="inline-block rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-600">
          返回首页
        </a>
      </div>
    </main>
  );
}

function NarrativeParagraph({ draft }: { draft: ReportDraft }) {
  const raw = (draft.narrative_text && draft.narrative_text.trim())
    ? draft.narrative_text
    : buildFallbackNarrative(draft);
  const html = renderInlineMath(raw);
  return (
    <p className="text-sm text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-800 mb-2">{title}</h2>
      {children}
    </section>
  );
}

function EmptyReport({ message }: { message: string }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl mb-3">📋</div>
      <p className="text-sm text-gray-500">{message}</p>
      <a href="/" className="mt-4 inline-block rounded-lg bg-blue-600 px-6 py-2 text-sm text-white">
        返回首页
      </a>
    </main>
  );
}
ENDOFFILE

# 同时确保 lib/report-utils.ts 也存在
if [ ! -f "lib/report-utils.ts" ]; then
  echo "创建 lib/report-utils.ts ..."
  mkdir -p lib
  cat > lib/report-utils.ts << 'ENDTS'
/**
 * lib/report-utils.ts
 * 报告工具函数 —— 纯 TypeScript 文件（非 TSX），避开 JSX 解析器问题。
 */

export interface ConfidenceFlag {
  question_id: string;
  flag: string;
  detail?: string;
}

/** 检测是否存在低信度标记 */
export function hasLowCredibility(flags: unknown): boolean {
  if (!Array.isArray(flags)) return false;
  const arr = flags as ConfidenceFlag[];
  for (const f of arr) {
    const flag = String(f?.flag ?? '').toLowerCase();
    if (flag.includes('low') || flag.includes('credibility') || flag === 'l') {
      return true;
    }
  }
  return false;
}

/** 构建降级叙述文本 */
export function buildFallbackNarrative(params: {
  total_score?: number;
  adaptive_level?: string;
  module_mastery?: Record<string, any>;
  ec_profile?: any;
  plan_4week?: any[];
  action_checklist?: any[];
}): string {
  const totalScore = params.total_score ?? 0;
  const adaptiveText = params.adaptive_level ?? '待加强';
  
  let greenCount = 0;
  let redCount = 0;
  if (params.module_mastery) {
    for (const v of Object.values(params.module_mastery)) {
      if ((v as any)?.level === 'green') greenCount++;
      if ((v as any)?.level === 'red') redCount++;
    }
  }

  let text = `本次诊断总分为 ${totalScore} 分，综合评定为${adaptiveText}。`;
  text += `掌握良好考点 ${greenCount} 个，薄弱考点 ${redCount} 个。`;

  if (params.ec_profile?.primary) {
    text += `主要错因为 ${params.ec_profile.primary}。`;
  }

  if ((params.plan_4week?.length ?? 0) > 0) {
    text += `已为您生成 ${params.plan_4week.length} 周干预计划，建议按计划进行针对性训练。`;
  }

  if ((params.action_checklist?.length ?? 0) > 0) {
    text += `重点关注基础概念回归和变式训练。`;
  }

  return text;
}
ENDTS
  echo "lib/report-utils.ts 已创建"
fi

# 清理缓存
rm -rf .next

echo "=== 文件已覆盖完成 ==="
echo "执行: npm run dev"
echo "如果还有错误，请把终端日志完整复制发给我"
