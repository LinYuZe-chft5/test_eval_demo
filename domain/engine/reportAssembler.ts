/**
 * domain/engine/reportAssembler.ts
 * Layer 4: 报告素材组装
 * 
 * 聚合所有单题阅卷JSON + 学情汇总表 = 纯净结构化素材包
 * 传给Layer 5的LLM只有汇总统计，不含原始答题记录
 */

import type { QuestionGradingResult } from './llmGrader';
import type { SummaryTable } from './aggregator';

export interface ReportMaterial {
  // Layer 3 汇总表（传给Layer 5 LLM的核心素材）
  summary_table: SummaryTable;

  // Layer 2 所有单题阅卷结果（用于前端展示详情，不传给LLM）
  per_question_results: QuestionGradingResult[];

  // 报告元数据
  report_meta: {
    student_name: string;
    grade: string;
    test_date: string;
    sku_code: string;
    sku_label: string;
  };

  // 标记是否为无效答卷
  is_invalid: boolean;
}

/**
 * 组装报告素材包
 */
export function assembleReport(params: {
  summaryTable: SummaryTable;
  gradingResults: QuestionGradingResult[];
  isInvalid: boolean;
  reportMeta: {
    student_name: string;
    grade: string;
    test_date: string;
    sku_code: string;
    sku_label: string;
  };
}): ReportMaterial {
  const { summaryTable, gradingResults, isInvalid, reportMeta } = params;

  return {
    summary_table: summaryTable,
    per_question_results: gradingResults,
    report_meta: reportMeta,
    is_invalid: isInvalid,
  };
}

/**
 * 提取传给Layer 5 LLM的素材（仅汇总统计，不含原始答题）
 */
export function extractLLMInput(material: ReportMaterial): any {
  const s = material.summary_table;

  // 无效答卷时返回简化素材
  if (material.is_invalid) {
    return {
      grade: material.report_meta.grade,
      is_invalid: true,
      genuine_ratio: s.genuine_response_stats.genuine_ratio,
      genuine_answers: s.genuine_response_stats.genuine_answers,
      total_questions: s.genuine_response_stats.total_questions,
    };
  }

  // 正常答卷：返回汇总统计
  return {
    grade: material.report_meta.grade,
    total_score: s.total_score,
    full_score: s.full_score,
    grade_level: s.grade_level,
    is_passed: s.is_passed,
    weak_knowledge_points: s.weak_knowledge_points,
    error_frequency_by_label: s.error_frequency_by_label,
    error_frequency_by_kp: s.error_frequency_by_kp,
    radar_chart: s.radar_chart,
    genuine_ratio: s.genuine_response_stats.genuine_ratio,
  };
}
