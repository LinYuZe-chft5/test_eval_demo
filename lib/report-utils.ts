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
