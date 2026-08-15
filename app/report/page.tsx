/**
 * app/report/page.tsx
 * 诊断报告页 —— 展示诊断结果（Server Component，数据在服务端获取）。
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

// 知识点中文名称映射
const KP_NAME_MAP: Record<string, string> = {
  'KP-01.1': '正负数概念',
  'KP-02.01': '有理数运算',
  'KP-02.02': '实数与无理数',
  'KP-03.01': '代数式与整式',
  'KP-03.02': '代入求值',
  'KP-04.01': '一元一次方程',
  'KP-04.02': '一元一次不等式',
  'KP-04.03': '含参方程',
  'KP-06.01': '二元一次方程组概念',
  'KP-06.02': '代入消元法',
  'KP-06.03': '加减消元法',
  'KP-06.04': '方程组应用题',
  'KP-06.05': '方程组整数解',
  'KP-07.01': '相交线与对顶角',
  'KP-07.02': '平行线判定',
  'KP-07.03': '平行线性质',
  'KP-07.04': '平移',
  'KP-07.05': '角平分线',
  'KP-07.06': '拐点问题',
  'KP-08.01': '幂的运算',
  'KP-08.02': '积的乘方',
  'KP-08.03': '乘法公式',
  'KP-08.04': '整式混合运算',
  'KP-09.01': '因式分解概念',
  'KP-09.02': '提公因式法',
  'KP-09.03': '公式法分解',
  'KP-09.04': '综合因式分解',
  'KP-09.05': '因式分解应用',
  'KP-09.06': '十字相乘法',
  'KP-10.01': '三角形三边关系',
  'KP-10.02': '三角形中线',
  'KP-10.03': '平行线分三角形',
  'KP-11.01': '不等式性质',
  'KP-11.02': '不等式解法',
  'KP-11.03': '不等式组应用',
  'KP-12.01': '分式有意义条件',
  'KP-12.02': '分式加减',
  'KP-12.03': '分式乘除',
  'KP-12.04': '分式方程',
  'KP-13.01': '全等三角形概念',
  'KP-13.02': '全等三角形判定',
  'KP-13.03': '全等三角形应用',
  'KP-23.01': '一元二次方程解法',
  'KP-23.02': '一元二次方程应用',
  'KP-P.1': '分数基本性质',
  'KP-P.2': '小数与分数互化',
  'KP-P.3': '钟表角度计算',
  'KP-P.4': '四则混合运算',
  'KP-P.5': '比例与比例尺',
  'KP-P.6': '正比例函数',
  'KP-P.7': '反比例函数',
};

function getKpName(kpCode: string): string {
  return KP_NAME_MAP[kpCode] || kpCode;
}

// 错因代码中文描述
const EC_DESC: Record<string, string> = {
  'EC-K1': '概念理解不清',
  'EC-K2': '公式/法则记忆错误',
  'EC-K3': '运算步骤有误',
  'EC-C1': '审题不仔细',
  'EC-C2': '条件运用不当',
  'EC-C3': '计算失误',
  'EC-C4': '逻辑推理跳跃',
  'EC-M1': '方法选择不当',
  'EC-M2': '运算技能不熟练',
  'EC-M3': '空间想象力不足',
  'EC-M4': '证明书写不规范',
};

function getEcDesc(ecCode: string): string {
  return EC_DESC[ecCode] || ecCode;
}

// 素养维度中文描述
const LITERACY_DESC: Record<string, string> = {
  'YS-01': '知识理解',
  'YS-02': '运算能力',
  'YS-03': '空间想象',
  'YS-04': '数据处理',
  'YS-05': '逻辑推理',
  'YS-06': '模型构建',
  'YS-07': '应用创新',
  'YS-08': '数学阅读',
};

function getLiteracyDesc(litCode: string): string {
  return LITERACY_DESC[litCode] || litCode;
}
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

function isLowCredibility(flags: unknown): boolean {
  if (!Array.isArray(flags)) {
    return false;
  }
  let result = false;
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    const flagStr = String(f?.flag ?? '').toLowerCase();
    if (flagStr.indexOf('low') >= 0) {
      result = true;
      break;
    }
    if (flagStr.indexOf('credibility') >= 0) {
      result = true;
      break;
    }
    if (flagStr === 'l') {
      result = true;
      break;
    }
  }
  return result;
}

function buildNarrative(draft: ReportDraft): string {
  const totalScore = draft.total_score ?? 0;
  const adaptiveText = draft.adaptive_level ?? '待加强';
  let greenCount = 0;
  let redCount = 0;
  if (draft.module_mastery) {
    const values = Object.values(draft.module_mastery);
    for (let i = 0; i < values.length; i++) {
      const v = values[i] as any;
      if (v?.level === 'green') greenCount++;
      if (v?.level === 'red') redCount++;
    }
  }
  let text = '本次诊断总分为 ' + totalScore + ' 分，综合评定为' + adaptiveText + '。';
  text += '掌握良好考点 ' + greenCount + ' 个，薄弱考点 ' + redCount + ' 个。';
  if (draft.ec_profile?.primary) {
    text += '主要错因为 ' + draft.ec_profile.primary + '。';
  }
  if (draft.plan_4week && draft.plan_4week.length > 0) {
    text += '已为您生成 ' + draft.plan_4week.length + ' 周干预计划，建议按计划进行针对性训练。';
  }
  if (draft.action_checklist && draft.action_checklist.length > 0) {
    text += '重点关注基础概念回归和变式训练。';
  }
  return text;
}

export default async function ReportPage({ searchParams }: PageProps) {
  const studentId = searchParams.student_id;

  if (!studentId) {
    return (
      <EmptyReport message="缺少学生标识，无法查看报告。" />
    );
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

  // 直接使用知识点代码和掌握度数据，显示中文名称
  const moduleList: { module: string; score: number; level: MasteryLevel; kpCode: string }[] = [];
  const masteryEntries = Object.entries(draft.module_mastery ?? {});
  for (let i = 0; i < masteryEntries.length; i++) {
    const [kp, entry] = masteryEntries[i];
    const kpName = getKpName(kp);
    const masteryValue = Number((entry as any).mastery_score);
    const level = (entry as any).level as MasteryLevel;
    if (!isNaN(masteryValue) && isFinite(masteryValue) && masteryValue > 0) {
      moduleList.push({ module: kpName, score: masteryValue, level: level, kpCode: kp });
    }
  }
  // 按得分排序
  moduleList.sort(function (a, b) { return b.score - a.score; });

  const radarRaw = Object.entries(draft.literacy_radar ?? {});
  const radarData: RadarDatum[] = [];
  const seenDims = new Set<string>();
  for (let i = 0; i < radarRaw.length; i++) {
    const [dim, v] = radarRaw[i];
    if (seenDims.has(dim)) continue;
    seenDims.add(dim);
    const litName = getLiteracyDesc(dim);
    radarData.push({ dimension: litName, value: (v as any).score });
  }

  const lowCred = isLowCredibility(draft.confidence_flags);
  const hasPrimaryEc = !!draft.ec_profile?.primary;
  const hasPlan = !!(draft.plan_4week && draft.plan_4week.length > 0);
  const hasChecklist = !!(draft.action_checklist && draft.action_checklist.length > 0);
  const hasConfFlags = !!(draft.confidence_flags && draft.confidence_flags.length > 0);
  const moduleListEmpty = moduleList.length === 0;
  const radarEmpty = radarData.length === 0;
  const hasSecondaryEc = !!draft.ec_profile?.secondary;
  const hasLowConfNotes = !!(draft.ec_profile?.low_confidence_notes && draft.ec_profile.low_confidence_notes.length > 0);
  const narrativeRaw = (draft.narrative_text && draft.narrative_text.trim()) ? draft.narrative_text : buildNarrative(draft);
  const narrativeHtml = renderInlineMath(narrativeRaw);
  const adaptLevel = draft.adaptive_level;
  const adaptColor = ADAPT_COLOR[adaptLevel] ?? 'text-gray-600';
  const adaptText = ADAPT_TEXT[adaptLevel] ?? adaptLevel;
  const totalScore = draft.total_score;

  return (
    <main className="min-h-screen px-4 py-6 space-y-4">
      <header className="text-center pt-2 pb-2">
        <h1 className="text-xl font-bold">诊断报告</h1>
        <p className="text-xs text-gray-400 mt-1">学生标识：{studentId}</p>
      </header>

      {lowCred && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
          ⚠️ 本次答卷存在低信度信号，结论仅供参考，建议复测。
        </div>
      )}

      <Section title="适应性评定">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">综合评定</span>
          <span className={'text-lg font-bold ' + adaptColor}>
            {adaptText}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm text-gray-600">总分</span>
          <span className="text-lg font-bold text-blue-600">
            {totalScore} 分
          </span>
        </div>
      </Section>

      <Section title="模块掌握度">
        {moduleListEmpty ? (
          <p className="text-xs text-gray-400">暂无模块数据</p>
        ) : (
          <ul className="space-y-2">
            {moduleList.map(function renderMod(m) {
              const displayPercent = !isNaN(m.score) && isFinite(m.score)
                ? Math.round(m.score * 100)
                : 0;
              const widthStyle = { width: displayPercent + '%' };
              return (
                <li key={m.module} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{m.module}</span>
                    <span className={'font-medium ' + LEVEL_COLOR[m.level]}>
                      {LEVEL_TEXT[m.level]}（{displayPercent}%）
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={widthStyle}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="素养雷达图">
        {radarEmpty ? (
          <p className="text-xs text-gray-400">暂无素养数据</p>
        ) : (
          <RadarChart data={radarData} max={1} />
        )}
      </Section>

      <Section title="首要错因及改进建议">
        {hasPrimaryEc ? (
          <div className="space-y-1 text-sm">
            <p>
              首要错因：
              <span className="font-semibold text-red-600">
                {getEcDesc(draft.ec_profile!.primary!)}
              </span>
            </p>
            {hasSecondaryEc && (
              <p className="text-gray-500">
                次要错因：{getEcDesc(draft.ec_profile!.secondary!)}
              </p>
            )}
            {hasLowConfNotes && (
              <p className="text-xs text-gray-400">
                {draft.ec_profile!.low_confidence_notes!.join('；')}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <p className="text-amber-600 font-medium">
              暂无显著归因错因
            </p>
            <p className="text-xs text-gray-500">
              可能原因：错题样本不足、多选题分散错因、或学生整体发挥较为稳定。
              建议关注错题涉及的知识点进行综合复习。
            </p>
            {hasChecklist && (
              <p className="text-xs text-gray-500">
                已为您生成 {draft.action_checklist!.length} 项改进行动清单，
                详见下方行动清单部分。
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="4周干预计划">
        {hasPlan ? (
          <ol className="space-y-2">
            {draft.plan_4week!.map(function renderWeek(w: any, idx: number) {
              const focusKpNames = (w.focus_kps && w.focus_kps.length)
                ? w.focus_kps.map(function (kp: string) { return getKpName(kp); }).join('、')
                : '综合复习（重点补强薄弱考点）';
              const weeklyContent = (w.weekly_content && w.weekly_content.length)
                ? w.weekly_content.join('；')
                : '';
              const weekNum = w.week || (idx + 1);
              return (
                <li
                  key={weekNum}
                  className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2"
                >
                  <div className="text-sm font-medium text-gray-800">
                    第 {weekNum} 周
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    焦点考点：{focusKpNames}
                  </div>
                  {weeklyContent && (
                    <div className="text-xs text-gray-600 mt-1 leading-relaxed">
                      训练内容：{weeklyContent}
                    </div>
                  )}
                  {w.practice_count && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      建议练习量：每周 {w.practice_count} 道
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-xs text-gray-400">暂无干预计划</p>
        )}
      </Section>

      {hasChecklist && (
        <Section title="行动清单">
          <ul className="space-y-2 text-sm">
            {draft.action_checklist!.map(function renderAction(a: any, i: number) {
              const kpName = getKpName(a.kp_code);
              const levelText = LEVEL_TEXT[a.level] || a.level;
              const levelColor = LEVEL_COLOR[a.level] || 'text-gray-600';
              return (
                <li key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-800">{kpName}</span>
                    <span className={'text-xs ' + levelColor}>{levelText}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">{a.action}</p>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {hasConfFlags && (
        <Section title="置信度标记">
          <ul className="space-y-1 text-xs text-gray-600">
            {draft.confidence_flags!.map(function renderFlag(f: any, i: number) {
              return (
                <li key={i}>
                  题目 {f.question_id}：{f.flag}
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <Section title="诊断综述">
        <p
          className="text-sm text-gray-700 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: narrativeHtml }}
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
