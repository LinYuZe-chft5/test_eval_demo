/**
 * domain/engine/aggregator.ts
 * Layer 3: 程序聚合统计引擎
 * 
 * 核心原则：纯代码运算，禁止调用LLM
 * 借鉴MBTI计分逻辑：每维度独立计分，小样本过滤，贝叶斯平滑
 * 
 * 执行内容：
 * 1. 雷达图分值计算（按维度权重加权累加）
 * 2. 总分计算 & 达标判定
 * 3. 错题频次统计（按知识点+错误标签两个维度）
 * 4. MBTI式维度置信度过滤
 * 5. 输出结构化学情汇总表
 */

import { EC_DEFINITIONS, LITERACY_DEFINITIONS } from './ecDefinitions';
import type { QuestionGradingResult } from './llmGrader';

// ===== 类型定义 =====

export interface AggregationInput {
  gradingResults: QuestionGradingResult[];
  questions: QuestionMeta[];
  genuineResponses: Set<string>; // question_id集合，标记哪些是真实有效作答
}

export interface QuestionMeta {
  question_id: string;
  q_type: string;
  score: number;
  kp_code: string;
  literacy_codes: string[];
  radar_dimensions: Array<{ dimension: string; weight: number }>;
  knowledge_points: {
    primary: { code: string; name: string };
    secondary: { code: string; name: string } | null;
  };
}

export interface SummaryTable {
  total_score: number;
  full_score: number;
  pass_threshold: number;
  is_passed: boolean;
  grade_level: string;

  radar_chart: Record<string, {
    score: number;
    level: string;
    question_count: number;
    valid: boolean;
  }>;

  error_frequency_by_kp: Array<{
    kp_code: string;
    kp_name: string;
    error_count: number;
    total_count: number;
    error_rate: number;
  }>;

  error_frequency_by_label: Array<{
    code: string;
    label: string;
    count: number;
    percentage: number;
  }>;

  weak_knowledge_points: Array<{
    kp_code: string;
    name: string;
    error_rate: number;
    severity: '高' | '中' | '低';
  }>;

  genuine_response_stats: {
    total_questions: number;
    genuine_answers: number;
    genuine_ratio: number;
    abandoned_count: number;
  };
}

// ===== 常量 =====

const PASS_THRESHOLD_RATIO = 0.6; // 及格线60%
const GENUINE_RATIO_THRESHOLD = 0.25; // 有效作答率<25%判定为无效答卷
const MIN_QUESTIONS_FOR_DIMENSION = 2; // 每维度最少2题才有效
const BAYESIAN_ALPHA_FEW = 1.5; // 3-4题时的平滑系数
const BAYESIAN_ALPHA_VERY_FEW = 2; // 2题时的平滑系数

// ===== MBTI式维度计分 =====

function computeRadarChart(
  gradingResults: QuestionGradingResult[],
  questions: QuestionMeta[],
  genuineResponses: Set<string>,
): SummaryTable['radar_chart'] {
  // 按维度收集题目
  const dimensionMap: Record<string, Array<{ correct: boolean; genuine: boolean }>> = {};

  for (const q of questions) {
    const result = gradingResults.find(r => r.question_id === q.question_id);
    if (!result) continue;

    const isGenuine = genuineResponses.has(q.question_id);
    
    for (const dim of q.radar_dimensions || []) {
      if (!dimensionMap[dim.dimension]) {
        dimensionMap[dim.dimension] = [];
      }
      dimensionMap[dim.dimension].push({
        correct: result.is_correct,
        genuine: isGenuine,
      });
    }
  }

  const radar: SummaryTable['radar_chart'] = {};

  for (const [dimension, items] of Object.entries(dimensionMap)) {
    // 只统计真实有效作答
    const genuineItems = items.filter(i => i.genuine);
    const genuineCount = genuineItems.length;
    const correctCount = genuineItems.filter(i => i.correct).length;

    if (genuineCount < MIN_QUESTIONS_FOR_DIMENSION) {
      // 数据不足，不显示该维度
      radar[dimension] = {
        score: 0,
        level: '数据不足',
        question_count: genuineCount,
        valid: false,
      };
      continue;
    }

    // 贝叶斯平滑
    let score: number;
    if (genuineCount >= 5) {
      // 题数≥5：直接用正确率
      score = (correctCount / genuineCount) * 100;
    } else if (genuineCount >= 3) {
      // 题数3-4：α=1.5平滑
      score = ((correctCount + BAYESIAN_ALPHA_FEW) / (genuineCount + BAYESIAN_ALPHA_FEW * 2)) * 100;
    } else {
      // 题数=2：α=2平滑
      score = ((correctCount + BAYESIAN_ALPHA_VERY_FEW) / (genuineCount + BAYESIAN_ALPHA_VERY_FEW * 2)) * 100;
    }

    radar[dimension] = {
      score: Math.round(score),
      level: getScoreLevel(score),
      question_count: genuineCount,
      valid: true,
    };
  }

  return radar;
}

function getScoreLevel(score: number): string {
  if (score >= 80) return '达标';
  if (score >= 50) return '不牢';
  return '薄弱';
}

// ===== 错题频次统计 =====

function computeErrorFrequencyByKp(
  gradingResults: QuestionGradingResult[],
  questions: QuestionMeta[],
  genuineResponses: Set<string>,
): SummaryTable['error_frequency_by_kp'] {
  const kpMap: Record<string, { error_count: number; total_count: number; name: string }> = {};

  for (const q of questions) {
    const result = gradingResults.find(r => r.question_id === q.question_id);
    if (!result) continue;
    if (!genuineResponses.has(q.question_id)) continue; // 只统计真实作答

    const kpCode = q.knowledge_points?.primary?.code || q.kp_code;
    const kpName = q.knowledge_points?.primary?.name || kpCode;

    if (!kpMap[kpCode]) {
      kpMap[kpCode] = { error_count: 0, total_count: 0, name: kpName };
    }
    kpMap[kpCode].total_count++;
    if (!result.is_correct) {
      kpMap[kpCode].error_count++;
    }
  }

  return Object.entries(kpMap)
    .map(([kp_code, data]) => ({
      kp_code,
      kp_name: data.name,
      error_count: data.error_count,
      total_count: data.total_count,
      error_rate: data.total_count > 0 ? data.error_count / data.total_count : 0,
    }))
    .filter(item => item.error_count > 0)
    .sort((a, b) => b.error_rate - a.error_rate);
}

function computeErrorFrequencyByLabel(
  gradingResults: QuestionGradingResult[],
  genuineResponses: Set<string>,
): SummaryTable['error_frequency_by_label'] {
  const labelMap: Record<string, number> = {};

  for (const result of gradingResults) {
    if (!genuineResponses.has(result.question_id)) continue;
    
    for (const label of result.matched_error_labels) {
      labelMap[label] = (labelMap[label] || 0) + 1;
    }
  }

  const total = Object.values(labelMap).reduce((sum, c) => sum + c, 0);

  return Object.entries(labelMap)
    .map(([code, count]) => ({
      code,
      label: EC_DEFINITIONS[code]?.label || code,
      count,
      percentage: total > 0 ? count / total : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

// ===== 薄弱知识点识别 =====

function identifyWeakKps(
  errorFreqByKp: SummaryTable['error_frequency_by_kp'],
): SummaryTable['weak_knowledge_points'] {
  return errorFreqByKp
    .filter(item => item.error_rate >= 0.5)
    .map(item => ({
      kp_code: item.kp_code,
      name: item.kp_name,
      error_rate: item.error_rate,
      severity: item.error_rate >= 0.75 ? '高' as const : item.error_rate >= 0.6 ? '中' as const : '低' as const,
    }))
    .sort((a, b) => {
      const severityOrder = { '高': 3, '中': 2, '低': 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
}

// ===== 主入口 =====

export function aggregate(input: AggregationInput): SummaryTable {
  const { gradingResults, questions, genuineResponses } = input;

  // 总分计算
  const totalScore = gradingResults.reduce((sum, r) => sum + r.student_score, 0);
  const fullScore = gradingResults.reduce((sum, r) => sum + r.full_score, 0);
  const passThreshold = Math.round(fullScore * PASS_THRESHOLD_RATIO);
  const isPassed = totalScore >= passThreshold;

  // 等级判定
  const ratio = fullScore > 0 ? totalScore / fullScore : 0;
  let gradeLevel: string;
  if (ratio >= 0.85) gradeLevel = '优秀';
  else if (ratio >= 0.7) gradeLevel = '良好';
  else if (ratio >= 0.6) gradeLevel = '达标';
  else if (ratio >= 0.4) gradeLevel = '待加强';
  else gradeLevel = '薄弱';

  // 雷达图
  const radarChart = computeRadarChart(gradingResults, questions, genuineResponses);

  // 错题频次
  const errorFreqByKp = computeErrorFrequencyByKp(gradingResults, questions, genuineResponses);
  const errorFreqByLabel = computeErrorFrequencyByLabel(gradingResults, genuineResponses);

  // 薄弱知识点
  const weakKps = identifyWeakKps(errorFreqByKp);

  // 有效作答统计
  const totalQuestions = questions.length;
  const genuineCount = questions.filter(q => genuineResponses.has(q.question_id)).length;
  const abandonedCount = questions.filter(q => {
    const result = gradingResults.find(r => r.question_id === q.question_id);
    return result && !genuineResponses.has(q.question_id);
  }).length;

  return {
    total_score: totalScore,
    full_score: fullScore,
    pass_threshold: passThreshold,
    is_passed: isPassed,
    grade_level: gradeLevel,
    radar_chart: radarChart,
    error_frequency_by_kp: errorFreqByKp,
    error_frequency_by_label: errorFreqByLabel,
    weak_knowledge_points: weakKps,
    genuine_response_stats: {
      total_questions: totalQuestions,
      genuine_answers: genuineCount,
      genuine_ratio: totalQuestions > 0 ? genuineCount / totalQuestions : 0,
      abandoned_count: abandonedCount,
    },
  };
}

/**
 * 判断是否为无效答卷
 */
export function isInvalidResponse(summary: SummaryTable): boolean {
  return summary.genuine_response_stats.genuine_ratio < GENUINE_RATIO_THRESHOLD
    || summary.genuine_response_stats.genuine_answers < 4;
}
