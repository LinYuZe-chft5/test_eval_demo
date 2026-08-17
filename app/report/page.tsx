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

// 知识点中文名称映射（从三个题库种子文件提取，覆盖初一/初二/初三所有知识点）
const KP_NAME_MAP: Record<string, string> = {
  // ===== 小升初衔接（S1 前置知识） =====
  'KP-P.1': '分数运算',
  'KP-P.2': '一元一次方程解法',
  'KP-P.3': '角与度分秒',
  'KP-P.4': '四则混合运算',
  'KP-P.5': '比例与比例尺',
  'KP-P.6': '正比例函数',
  'KP-P.7': '反比例函数',

  // ===== 初一上（S1 身份） =====
  'KP-01.1': '正负数意义',
  'KP-01.2': '数轴',
  'KP-01.3': '绝对值与相反数',
  'KP-01.4': '有理数比较',
  'KP-01.5': '有理数加法',
  'KP-01.6': '有理数减法',
  'KP-01.8': '有理数乘法',
  'KP-01.9': '有理数除法',
  'KP-01.10': '有理数乘方',
  'KP-01.11': '有理数混合运算',
  // 兼容格式
  'KP-01.01': '正负数与有理数概念',
  'KP-01.02': '数轴与绝对值',

  // ===== 初一下（S1 身份） =====
  'KP-03.1': '代数式概念',
  'KP-03.2': '列代数式',
  'KP-03.01': '代数式与整式概念',
  'KP-03.02': '代入求值与整式运算',
  'KP-04.1': '单项式',
  'KP-04.2': '同类项',
  'KP-04.01': '一元一次方程',
  'KP-04.02': '一元一次不等式',
  'KP-04.03': '含参方程与不等式',
  'KP-05.1': '等式性质',

  // ===== 初二（S3-01 身份）—— 从s3_seed.json实际提取 =====
  // 第6模块：方程组
  'KP-06.01': '二元一次方程组概念',
  'KP-06.02': '代入消元法',
  'KP-06.03': '加减消元法',
  'KP-06.04': '方程组应用',
  'KP-06.05': '方程组整数解',

  // 第7模块：不等式（重要！S3题库中KP-07是不等式，不是相交线）
  'KP-07.01': '不等式概念',
  'KP-07.02': '不等式解法',
  'KP-07.03': '不等式组',
  'KP-07.04': '不等式应用',
  'KP-07.05': '含参不等式组',
  'KP-07.06': '不等式组整数解',
  'KP-07.07': '不等式与角平分线综合',

  // 第8模块：函数
  'KP-08.01': '变量与函数',
  'KP-08.02': '一次函数',
  'KP-08.03': '函数图象',
  'KP-08.04': '函数性质',

  // 第9模块：整式乘法与因式分解
  'KP-09.01': '整式乘法',
  'KP-09.02': '乘法公式',
  'KP-09.03': '因式分解',
  'KP-09.04': '因式分解综合技巧',
  'KP-09.05': '因式分解应用',
  'KP-09.06': '十字相乘法',

  // 第10模块：分式
  'KP-10.01': '分式概念',
  'KP-10.02': '分式运算',
  'KP-10.03': '分式方程',
  'KP-10.04': '分式化简求值',
  'KP-10.05': '三角形角度计算综合',

  // 第11模块：平行线与三角形（重要！S3题库中KP-11是平行线，不是不等式）
  'KP-11.01': '平行线判定',
  'KP-11.02': '平行线性质',
  'KP-11.03': '平行线综合应用',
  'KP-11.04': '含参不等式组',

  // 第12模块：全等三角形（S3题库中KP-12是全等三角形，不是分式）
  'KP-12.01': '全等三角形判定',
  'KP-12.02': '全等三角形性质',
  'KP-12.03': '角平分线与全等',
  'KP-12.04': '全等三角形证明',

  // 第13模块：三角形综合
  'KP-13.01': '三角形基本概念',
  'KP-13.02': '三角形边角关系',
  'KP-13.03': '全等三角形综合证明',
  'KP-13.04': '全等三角形判定与性质综合',

  // 第14模块：三角形（S1和S3兼容）
  'KP-14.01': '三角形三边关系',
  'KP-14.02': '三角形中线与高',
  'KP-14.03': '三角形内角与外角',
  'KP-14.04': '多边形内角和',

  // ===== 初三（S6-01 身份）—— 从s6_seed.json实际提取 =====
  'KP-23.01': '一元二次方程解法',
  'KP-23.02': '韦达定理与判别式',
  'KP-24.01': '圆的性质',
  'KP-24.02': '切线',
  'KP-25.01': '概率概念',
  'KP-25.02': '概率计算',
  // 补充完整初三映射
  'KP-28.01': '概率初步',
  'KP-28.02': '用列举法求概率',
  'KP-29.01': '相似三角形判定',
  'KP-29.02': '相似三角形性质与应用',
  'KP-30.01': '锐角三角函数',
  'KP-31.01': '投影与视图',
  'KP-31.02': '投影与视图应用',

  // ===== 备用兜底映射（S1身份：相交线、平行线等几何模块） =====
  // 如果S1身份题目出现这些KP代码，使用以下映射
  'KP-G01': '相交线与对顶角',
  'KP-G02': '平行线判定',
  'KP-G03': '平行线性质',
  'KP-G04': '平移变换',
  'KP-G05': '角平分线定理',
  'KP-G06': '几何综合题',
  'KP-G07': '辅助线构造',
};

function getKpName(kpCode: string): string {
  if (!kpCode) return '';
  // 清理可能的前缀（如 "知识点KP-07.06" -> "KP-07.06"）
  let cleanCode = kpCode.trim();
  // 移除常见前缀
  const prefixes = ['知识点', '考点', 'KP：', 'KP:'];
  for (const prefix of prefixes) {
    if (cleanCode.startsWith(prefix)) {
      cleanCode = cleanCode.slice(prefix.length).trim();
      break;
    }
  }
  // 查找映射表
  if (KP_NAME_MAP[cleanCode]) return KP_NAME_MAP[cleanCode];
  // 如果本身就是中文名（不在映射表中），直接返回
  if (!cleanCode.startsWith('KP-')) return cleanCode;
  // 找不到映射，返回原代码
  return cleanCode;
}

// 替换文本中所有 KP 代码为中文名称
function replaceKpCodesInText(text: string): string {
  if (!text) return '';
  return text.replace(/(知识点|考点)?\s*KP-\d+\.\d+/g, function (match) {
    return getKpName(match);
  });
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

function getEcDesc(ecCode: any): string {
  if (ecCode === null || ecCode === undefined) return '';
  if (typeof ecCode === 'string') return EC_DESC[ecCode] || ecCode;
  // 兼容旧数据格式（ecProfile.primary 为对象时取code属性）
  if (typeof ecCode === 'object') {
    const code = (ecCode as any).code;
    return code ? (EC_DESC[code] || (ecCode as any).label || String(code)) : '';
  }
  return String(ecCode);
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
    const primaryStr = typeof draft.ec_profile.primary === 'object'
      ? getEcDesc(draft.ec_profile.primary)
      : getEcDesc(String(draft.ec_profile.primary));
    if (primaryStr) text += '主要错因为 ' + primaryStr + '。';
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

  // 🔴 DEBUG: 验证数据库读取的数据结构
  console.log('[report/page] 数据库读取结果:', {
    hasModuleMastery: !!row?.moduleMastery,
    moduleMasteryType: row?.moduleMastery ? typeof row.moduleMastery : 'undefined',
    moduleMasteryKeys: row?.moduleMastery ? Object.keys(row.moduleMastery).slice(0, 3) : [],
    moduleMasterySample: row?.moduleMastery ? Object.entries(row.moduleMastery).slice(0, 2).map(([k, v]) => ({
      k,
      vKeys: v ? Object.keys(v) : [],
      sampleValue: v ? { ...v } : null,
    })) : [],
    hasPlan4week: !!row?.plan4week,
    plan4weekLength: row?.plan4week?.length || 0,
    plan4weekSample: row?.plan4week?.[0] ? {
      keys: Object.keys(row.plan4week[0]),
      focus_kps: row.plan4week[0].focus_kps,
      weekly_content: row.plan4week[0].weekly_content,
      focus_kps_type: typeof row.plan4week[0].focus_kps,
      weekly_content_type: typeof row.plan4week[0].weekly_content,
    } : null,
    hasActionChecklist: !!row?.actionChecklist,
    actionChecklistLength: row?.actionChecklist?.length || 0,
    actionChecklistSample: row?.actionChecklist?.[0] ? {
      keys: Object.keys(row.actionChecklist[0]),
      kp_code: row.actionChecklist[0].kp_code,
      kp_code_type: typeof row.actionChecklist[0].kp_code,
      name: row.actionChecklist[0].name,
      level: row.actionChecklist[0].level,
      action: row.actionChecklist[0].action,
    } : null,
  });

  if (!row) {
    return (
      <EmptyReport message="报告尚未生成。请完成全部三天诊断后再查看。" />
    );
  }

  // 🔴 关键修复：优先读取结构化字段（literacyRadar/moduleMastery等），
  // degradedTexts仅作为兼容旧报告的兜底，决不允许其覆盖最新结构化数据。
  // 否则零作答用户会看到旧报告（上一位用户或上一次的）缓存的雷达图。
  const hasNewStructuredData = (
    row.literacyRadar !== undefined &&
    row.moduleMastery !== undefined &&
    row.totalScore !== undefined
  );

  // 如果存在结构化字段（新格式），直接使用，完全忽略degradedTexts旧缓存
  // 只有完全没有结构化字段（纯旧版本报告）才fallback到degradedTexts
  const fallbackDraft: ReportDraft = row.degradedTexts && !hasNewStructuredData
    ? (row.degradedTexts as ReportDraft)
    : null;

  const degradedTextListFromStructured: any[] = Array.isArray((row as any).degraded_texts)
    ? (row as any).degraded_texts
    : [];

  const draft: ReportDraft = fallbackDraft ?? {
    total_score: row.totalScore ?? 0,
    adaptive_level: row.adaptiveLevel ?? 'weak',
    module_mastery: row.moduleMastery ?? {},
    literacy_radar: row.literacyRadar ?? {},
    ec_profile: row.ecProfile ?? { primary: null, secondary: null, distribution: {}, low_confidence_notes: [] },
    confidence_flags: row.confidenceFlags ?? [],
    plan_4week: row.plan4week ?? [],
    action_checklist: row.actionChecklist ?? [],
    narrative_text: row.narrativeText ?? '',
    degraded_texts: degradedTextListFromStructured,
  };

  // 直接使用知识点代码和掌握度数据，显示中文名称
  const moduleList: { module: string; score: number; level: MasteryLevel; kpCode: string }[] = [];
  const masteryEntries = Object.entries(draft.module_mastery ?? {});
  for (let i = 0; i < masteryEntries.length; i++) {
    const [kp, entry] = masteryEntries[i];
    // 智能提取知识点名称：统一通过 getKpName 处理，确保前缀清理
    const rawName = (entry as any)?.kp_name || kp;
    const kpName = getKpName(rawName);
    const masteryValue = Number((entry as any).mastery_score);
    let level = (entry as any).level as MasteryLevel;
    
    // 智能推断 level：如果没有显式 level，根据 score 计算
    if (!level || !['green', 'yellow', 'red'].includes(level)) {
      if (masteryValue >= 0.8) level = 'green';
      else if (masteryValue >= 0.5) level = 'yellow';
      else level = 'red';
    }
    
    // 放宽条件：接受任何有效的 masteryValue（包括0，表示完全未掌握）
    if (!isNaN(masteryValue) && isFinite(masteryValue)) {
      moduleList.push({ module: kpName, score: masteryValue, level: level, kpCode: kp });
    }
  }
  // 按得分排序（掌握度低的排前面，方便用户先看薄弱环节）
  moduleList.sort(function (a, b) { return a.score - b.score; });

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
  const narrativeRaw = (draft.narrative_text && draft.narrative_text.trim()) 
    ? replaceKpCodesInText(draft.narrative_text) 
    : buildNarrative(draft);
  const narrativeHtml = renderInlineMath(narrativeRaw);
  const adaptLevel = draft.adaptive_level;
  const adaptColor = ADAPT_COLOR[adaptLevel] ?? 'text-gray-600';
  const adaptText = ADAPT_TEXT[adaptLevel] ?? adaptLevel;
  const totalScore = draft.total_score;

  // 🔴 degraded_texts 警告渲染数据（空答卷/低信度的强提示）
  const degradedTextsList: { key: string; text: string }[] = Array.isArray(draft.degraded_texts)
    ? (draft.degraded_texts as any[])
    : [];
  const blankResponseWarn = degradedTextsList.find((d: any) =>
    String(d.key || '').indexOf('blank') >= 0
  );

  return (
    <main className="min-h-screen px-4 py-6 space-y-4">
      <header className="text-center pt-2 pb-2">
        <h1 className="text-xl font-bold">诊断报告</h1>
        <p className="text-xs text-gray-400 mt-1">学生标识：{studentId}</p>
      </header>

      {/* 🔴【无效答卷警告（最优先展示）】空答卷红色全屏提醒 */}
      {blankResponseWarn && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 px-4 py-4 space-y-2 shadow-sm">
          <div className="flex items-start gap-2">
            <span className="text-2xl">🚫</span>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-700 mb-1">本次诊断为【无效答卷】</h3>
              <p className="text-xs text-red-600 whitespace-pre-line leading-relaxed">
                {String(blankResponseWarn.text).replace(/^⚠️【无效答卷警告】/, '').trim()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 其他 degraded_texts 警告（非空白类） */}
      {degradedTextsList.filter((d: any) => String(d.key || '').indexOf('blank') < 0).map((d: any, i: number) => (
        <div key={i} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 whitespace-pre-line leading-relaxed">
          {String(d.text)}
        </div>
      ))}

      {lowCred && !blankResponseWarn && (
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
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3 space-y-1">
            <p className="text-xs text-gray-500 font-medium">📭 暂无模块掌握度数据</p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              诊断算法（参考MBTI维度投票原理）要求每个知识点至少<b>2道真实作答</b>才能生成掌握度结论。
              空答卷、大量秒跳过、或作答题目分布不均时，会选择「不输出结论」而非「随意给分」，以免误判。
              完成三天全部题目后再查看即可获得完整模块图谱。
            </p>
          </div>
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
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 space-y-2 text-center">
            <div className="text-3xl">🕸️</div>
            <p className="text-xs text-gray-500 font-medium">素养雷达图未生成（显示中心点/空白）</p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              <b>算法原理说明（参考MBTI 16型人格）：</b><br/>
              MBTI每维度至少需要3道题的投票才输出人格倾向；
              本系统同理，每个素养维度（运算能力、推理能力等）需要至少<b>2道真实作答</b>，
              且整体真实作答题数≥4道才渲染雷达图。<b>空答卷 = 数据不足 ≠ 能力差</b>，
              系统选择显示中心空白而非虚假多边形，避免对学生产生标签化误判。
            </p>
            <p className="text-[11px] text-blue-500 leading-relaxed">
              ✅ 解决方法：重新完成三天测评，每题认真作答（即使做错也能参与计算）
            </p>
          </div>
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
          <ol className="space-y-3">
            {draft.plan_4week!.map(function renderWeek(w: any, idx: number) {
              // 智能提取焦点知识点名称
              let focusKpNames = '';
              if (w.focus_kps && w.focus_kps.length) {
                focusKpNames = w.focus_kps.map(function (kp: string) { 
                  // 统一使用 getKpName 函数处理（已支持前缀清理）
                  return getKpName(kp);
                }).filter(Boolean).join('、');
              } else if (w.focus_kp) {
                // 兼容单个 focus_kp 字段
                focusKpNames = getKpName(w.focus_kp);
              }
              
              // 如果仍然为空，使用更具体的默认文案
              if (!focusKpNames) {
                const weekTheme = ['基础概念巩固', '变式训练提升', '综合应用强化', '查漏补缺冲刺'];
                focusKpNames = weekTheme[idx] || '综合能力提升';
              }
              
              // 智能提取训练内容
              let weeklyContent = '';
              if (w.weekly_content && w.weekly_content.length) {
                weeklyContent = w.weekly_content.map((c: string) => {
                  // 替换内容中的 KP 代码为中文名称
                  let content = replaceKpCodesInText(c);
                  // 如果内容太短或太泛，添加额外说明
                  if (content.length < 10 && !content.includes('练习')) return content + '，建议配合教材例题加深理解';
                  return content;
                }).join('；');
              } else if (w.content && typeof w.content === 'string') {
                weeklyContent = replaceKpCodesInText(w.content);
              }
              
              // 如果没有训练内容，生成具体建议
              if (!weeklyContent) {
                const weekSuggestions = [
                  '从基础例题入手，每天完成5-8道基础练习题，确保概念准确无误',
                  '进行变式训练，每天完成6-10道变式题，检验知识掌握的灵活性',
                  '完成综合应用题，每天3-5道涉及多个知识点的综合题，训练知识迁移能力',
                  '进行模拟测试，完成一套小测检验学习成果，针对薄弱环节重点突破',
                ];
                weeklyContent = weekSuggestions[idx] || weekSuggestions[0];
              }
              
              const weekNum = w.week || (idx + 1);
              const practiceCount = w.practice_count || w.daily_count;
              
              return (
                <li
                  key={weekNum}
                  className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-800">
                      第 {weekNum} 周
                    </div>
                    <div className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                      {['基础巩固', '变式提升', '综合应用', '查漏补缺'][idx] || '持续训练'}
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1.5">
                    <span className="text-gray-400">焦点：</span>
                    <span className="font-medium">{focusKpNames}</span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                    <span className="text-gray-400">训练：</span>
                    {weeklyContent}
                  </div>
                  {practiceCount && (
                    <div className="text-xs text-gray-400 mt-1">
                      💡 建议每日练习量：{practiceCount} 道题
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-3">
            <p className="text-xs text-gray-500 font-medium">📋 4周干预计划生成中...</p>
            <p className="text-[11px] text-gray-400 mt-1">
              系统正在为您分析薄弱环节并生成个性化学习计划，请稍后刷新查看。
            </p>
          </div>
        )}
      </Section>

      {hasChecklist && (
        <Section title="行动清单">
          <ul className="space-y-2 text-sm">
            {draft.action_checklist!.map(function renderAction(a: any, i: number) {
              // 智能提取知识点名称：统一通过 getKpName 处理
              let kpName = '';
              if (a.kp_code) {
                kpName = getKpName(a.kp_code);
              } else if (a.name) {
                kpName = getKpName(a.name);
              } else if (a.kp_name) {
                kpName = getKpName(a.kp_name);
              }
              if (!kpName) {
                kpName = '薄弱知识点';
              }
              
              // 智能提取 level 并映射
              let levelText = LEVEL_TEXT[a.level];
              let levelColor = LEVEL_COLOR[a.level];
              if (!levelText) {
                // 从 severity 推断 level
                const severity = String(a.severity || '').toLowerCase();
                if (severity === '高' || severity === 'high' || severity === 'red') {
                  levelText = LEVEL_TEXT.red;
                  levelColor = LEVEL_COLOR.red;
                } else if (severity === '中' || severity === 'medium' || severity === 'yellow') {
                  levelText = LEVEL_TEXT.yellow;
                  levelColor = LEVEL_COLOR.yellow;
                } else {
                  levelText = LEVEL_TEXT.green;
                  levelColor = LEVEL_COLOR.green;
                }
              }
              
              // 智能提取行动建议
              let actionText = a.action || a.suggestion || a.tip || '';
              if (actionText) {
                // 替换内容中的 KP 代码为中文名称
                actionText = replaceKpCodesInText(actionText);
              } else {
                // 生成默认行动建议
                const level = a.level || 'yellow';
                if (level === 'red') {
                  actionText = `重点补强${kpName}，建议每天做8-10道基础变式题，从教材例题开始，确保概念准确无误`;
                } else if (level === 'yellow') {
                  actionText = `巩固${kpName}，建议每天做5-8道练习题，重点关注错题重做和变式训练`;
                } else {
                  actionText = `保持${kpName}的良好状态，建议每天做3-5道综合题，提升知识迁移能力`;
                }
              }
              
              return (
                <li key={i} className="rounded-lg bg-gray-50 px-3 py-2.5 border border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-gray-800">{kpName}</span>
                    <span className={'text-xs font-medium px-2 py-0.5 rounded ' + (levelColor + ' bg-white')}>
                      {levelText}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    <span className="text-gray-400">💡 </span>
                    {actionText}
                  </p>
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
