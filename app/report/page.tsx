/**
 * app/report/page.tsx
 * 诊断报告页 —— 展示诊断结果（Server Component，数据在服务端获取）。
 * - 适应性评定（达标/基本达标/待加强）
 * - 模块掌握度（数与代数/图形与几何）
 * - 素养雷达图（Recharts）
 * - 首要错因及改进建议
 * - 4周干预计划
 * - 置信度标记（低信度提示）
 */
import { prisma } from '@/lib/prisma';
import { renderInlineMath } from '@/lib/katex';
import RadarChart, { type RadarDatum } from '@/components/RadarChart';
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

  // 查询报告草稿
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
    ec_profile: row.ecProfile ?? { primary: null, secondary: null },
    confidence_flags: row.confidenceFlags ?? [],
    plan_4week: row.plan4week ?? [],
    action_checklist: row.actionChecklist ?? [],
    narrative_text: row.narrativeText ?? '',
    degraded_texts: [],
  };

  // 查询知识点依赖，用于按模块聚合掌握度
  const kpRows: any[] = await (prisma as any).kpDependencies.findMany({
    select: 'kpCode,module',
  });
  const kpModule = new Map<string, string>(kpRows.map((r) => [r.kp_code ?? r.kpCode, r.module]));

  // 按模块聚合掌握度
  const moduleAgg: Record<
    string,
    { sum: number; count: number; level: MasteryLevel }
  > = {};
  for (const [kp, entry] of Object.entries(draft.module_mastery ?? {})) {
    const mod = kpModule.get(kp) ?? '其他';
    if (!moduleAgg[mod]) moduleAgg[mod] = { sum: 0, count: 0, level: 'red' };
    if (Number.isFinite(entry.mastery_score)) {
      moduleAgg[mod].sum += entry.mastery_score;
      moduleAgg[mod].count += 1;
    }
  }
  const moduleList = Object.entries(moduleAgg).map(([mod, v]) => {
    const avg = v.count > 0 ? v.sum / v.count : 0;
    const level: MasteryLevel = avg >= 0.8 ? 'green' : avg >= 0.5 ? 'yellow' : 'red';
    return { module: mod, score: avg, level };
  });

  // 素养雷达数据
  const radarRaw = Object.entries(draft.literacy_radar ?? {}).map(
    ([dim, v]) => ({ dimension: dim, value: v.score }),
  );
  const seenDims = new Set<string>();
  const radarData: RadarDatum[] = radarRaw.filter((d) => {
    if (seenDims.has(d.dimension)) return false;
    seenDims.add(d.dimension);
    return true;
  });

  const lowCredibility = Array.isArray(draft.confidence_flags) &&
    draft.confidence_flags.some((f: any) => /低信度|credibility|low/i.test(f.flag));

  return (
    <main className="min-h-screen px-4 py-6 space-y-4">
      {/* 标题 */}
      <header className="text-center pt-2 pb-2">
        <h1 className="text-xl font-bold">诊断报告</h1>
        <p className="text-xs text-gray-400 mt-1">学生标识：{studentId}</p>
      </header>

      {/* 低信度提示 */}
      {lowCredibility && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          ⚠️ 本次答卷存在低信度信号，结论仅供参考，建议复测。
        </div>
      )}

      {/* 适应性评定 */}
      <Section title="适应性评定">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">综合评定</span>
          <span
            className={`text-lg font-bold ${
              ADAPT_COLOR[draft.adaptive_level] ?? 'text-gray-600'
            }`}
          >
            {ADAPT_TEXT[draft.adaptive_level] ?? draft.adaptive_level}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm text-gray-600">总分</span>
          <span className="text-lg font-bold text-blue-600">
            {draft.total_score} 分
          </span>
        </div>
      </Section>

      {/* 模块掌握度 */}
      <Section title="模块掌握度">
        {moduleList.length === 0 ? (
          <p className="text-xs text-gray-400">暂无模块数据</p>
        ) : (
          <ul className="space-y-2">
            {moduleList.map((m) => (
              <li key={m.module} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{m.module}</span>
                  <span className={`font-medium ${LEVEL_COLOR[m.level]}`}>
                    {LEVEL_TEXT[m.level]}（{Number.isFinite(m.score) ? Math.round(m.score * 100) : 0}%）
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Number.isFinite(m.score) ? Math.round(m.score * 100) : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 素养雷达图 */}
      <Section title="素养雷达图">
        {radarData.length > 0 ? (
          <RadarChart data={radarData} max={1} />
        ) : (
          <p className="text-xs text-gray-400">暂无素养数据</p>
        )}
      </Section>

      {/* 首要错因及改进建议 */}
      <Section title="首要错因及改进建议">
        {draft.ec_profile?.primary ? (
          <div className="space-y-1 text-sm">
            <p>
              首要错因：
              <span className="font-semibold text-red-600">
                {draft.ec_profile.primary}
              </span>
            </p>
            {draft.ec_profile.secondary && (
              <p className="text-gray-500">
                次要错因：{draft.ec_profile.secondary}
              </p>
            )}
            {draft.ec_profile.low_confidence_notes?.length > 0 && (
              <p className="text-xs text-gray-400">
                {draft.ec_profile.low_confidence_notes.join('；')}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400">无显著错因</p>
        )}
      </Section>

      {/* 4周干预计划 */}
      <Section title="4周干预计划">
        {draft.plan_4week?.length ? (
          <ol className="space-y-2">
            {draft.plan_4week.map((w) => (
              <li
                key={w.week}
                className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2"
              >
                <div className="text-sm font-medium text-gray-800">
                  第 {w.week} 周
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  焦点考点：
                  {w.focus_kps?.length ? w.focus_kps.join('、') : '—'}
                </div>
                {w.method_cards?.length > 0 && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    方法卡：{w.method_cards.map((c) => c.title ?? c.id).join('、')}
                  </div>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-gray-400">暂无干预计划</p>
        )}
      </Section>

      {/* 行动清单 */}
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

      {/* 置信度标记 */}
      {draft.confidence_flags?.length > 0 && (
        <Section title="置信度标记">
          <ul className="space-y-1 text-xs text-gray-600">
            {draft.confidence_flags.map((f, i) => (
              <li key={i}>
                题目 {f.question_id}：{f.flag}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 叙述 */}
      <Section title="诊断综述">
        <p
          className="text-sm text-gray-700 leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: renderInlineMath(draft.narrative_text ?? ''),
          }}
        />
      </Section>

      <div className="pt-2 pb-6 text-center">
        <a
          href="/"
          className="inline-block rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-600"
        >
          返回首页
        </a>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
      <a
        href="/"
        className="mt-4 inline-block rounded-lg bg-blue-600 px-6 py-2 text-sm text-white"
      >
        返回首页
      </a>
    </main>
  );
}
