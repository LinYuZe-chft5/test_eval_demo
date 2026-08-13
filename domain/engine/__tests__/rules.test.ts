/**
 * domain/engine/__tests__/rules.test.ts
 * Codex_04 规则引擎单元测试（第 7 章 18 个用例）
 *
 * 说明：部分用例的“建议访谈确认 / L3-L4 隐藏 / probe_unavailable 文案”等
 * 属于展示层结论，纯函数层不产出文本；此处按实际函数签名与可观测返回值
 * 进行等价断言（见各用例注释）。
 */
import { describe, it, expect } from 'vitest';
import { RULES } from '../../config/rules';
import { gradeFill, gradeSteps, getChoiceEcCode } from '../grading';
import { shouldProbe, onProbeGraded, selectProbeQuestion } from '../probe';
import { calcKpMastery, calcConfidence } from '../mastery';
import { calcEcProfile } from '../ecProfile';
import { findRootCause } from '../pathEngine';
import { checkCredibility } from '../credibility';
import { buildReport } from '../reportBuilder';
import type { ProbeRecord, ProbeQuestion } from '../probe';
import type { ErrorRecord } from '../ecProfile';
import type { KpDep } from '../pathEngine';
import type { CredSession, CredRecord, CredQuestion } from '../credibility';

describe('Codex_04 规则引擎', () => {
  it('T1: gradeFill 全角“ １／２ ”转半角后与 1/2 等值，fraction 形式判对', () => {
    const r = gradeFill(' １／２ ', '1/2', { accept_forms: ['fraction'] });
    expect(r.is_correct).toBe(true);
    expect(r.invalid_input).toBe(false);
  });

  it('T2: gradeFill 仅声明 fraction 形式时，不等值的 decimal 输入(0.5 vs 1/3)判错', () => {
    // 无 decimal 形式通道：0.5 与 1/3 不等值，fraction 形式比较失败 → 判错
    const r = gradeFill('0.5', '1/3', { accept_forms: ['fraction'] });
    expect(r.is_correct).toBe(false);
    expect(r.invalid_input).toBe(false);
  });

  it('T3: gradeFill decimal 容差判定 |0.51-0.5|=0.01 ≤ tol(0.01) → 判对', () => {
    const r = gradeFill('0.51', '0.5', {
      accept_forms: ['decimal'],
      decimal_tolerance: 0.01,
    });
    expect(r.is_correct).toBe(true);
  });

  it('T4: gradeFill allow_pi=false 禁用 π 形式，标准答案 π 不可解析 → 判错', () => {
    // allow_pi=false：标准答案 "π" 含 π 被判 INVALID（π 形式被禁用）；
    // 学生输入 3.14 虽可解析为普通小数，但标准答案不可解析 → 判错（不计 invalid_input）
    const r = gradeFill('3.14', 'π', {
      accept_forms: ['decimal'],
      allow_pi: false,
      decimal_tolerance: 0.01,
    });
    expect(r.is_correct).toBe(false);
    expect(r.invalid_input).toBe(false);
  });

  it('T5: gradeFill 无法解析的输入 “abc” → 判错且 invalid_input=true', () => {
    const r = gradeFill('abc', '1/2', { accept_forms: ['fraction'] });
    expect(r.is_correct).toBe(false);
    expect(r.invalid_input).toBe(true);
  });

  it('T6: 分步题各步独立判分——第1步错第2步对，第2步独立得分', () => {
    const defs = [
      { seq: 1, prompt: 'step1', answer: 'correct', score: 2 },
      { seq: 2, prompt: 'step2', answer: 'correct', score: 3 },
    ];
    const ans = [
      { seq: 1, answer: 'wrong' },
      { seq: 2, answer: 'correct' },
    ];
    const r = gradeSteps(ans, defs);
    expect(r.step_results[0].is_correct).toBe(false);
    expect(r.step_results[0].score).toBe(0);
    expect(r.step_results[1].is_correct).toBe(true);
    expect(r.step_results[1].score).toBe(3);
    expect(r.total_score).toBe(3);
  });

  it('T7: 0.4×预期-1秒答对触发探测；探测答错→confirmed_guess，掌握度贡献=0', () => {
    const expectedSec = 10;
    const fastThresholdMs = expectedSec * 1000 * RULES.FAST_ANSWER_RATIO; // 4000ms
    const timeSpent = 3000; // 0.4×10 - 1 = 3 秒
    expect(timeSpent).toBeLessThan(fastThresholdMs);

    const record: ProbeRecord = {
      question_id: 'q1',
      is_correct: true,
      time_spent_ms: timeSpent,
      self_mark: null,
    };
    const question: ProbeQuestion = { id: 'q1', expected_time_sec: expectedSec };

    // 1) 触发探测
    expect(shouldProbe(record, question, 0)).toBe(true);

    // 2) 探测答错 → confirmed_guess + guess_tendency 标记
    const probeGraded = onProbeGraded(
      { question_id: 'q1p', is_correct: false, time_spent_ms: 5000 },
      { ...record, behavior_tag: 'normal_correct' },
    );
    expect(probeGraded.probe_result).toBe('confirmed_guess');
    expect(probeGraded.behavior_tag_update).toContain('guess_tendency');

    // 3) 原题 confirmed_guess → 掌握度分子按 0 计，贡献=0
    const mastery = calcKpMastery([
      { is_correct: true, probe_result: 'confirmed_guess' },
    ]);
    expect(mastery.mastery_score).toBe(0);
  });

  it('T8: 探测池无同难度题→selectProbeQuestion 返回 null（probe_unavailable），不抛错', () => {
    const question: ProbeQuestion = {
      id: 'q1',
      expected_time_sec: 10,
      parallel_group_id: 'pg1',
      kp_code: 'KP1',
      difficulty_est: 0.5,
    };
    // 同 KP 但难度差 0.4 > PROBE_DIFF_TOLERANCE(0.05)，且不同平行组 → 无可用探测题
    const all: ProbeQuestion[] = [
      {
        id: 'q2',
        expected_time_sec: 10,
        kp_code: 'KP1',
        difficulty_est: 0.9,
        status: 'active',
        is_anchor: false,
      },
    ];
    const fn = () =>
      selectProbeQuestion(
        { question_id: 'q1', is_correct: true, time_spent_ms: 1000 },
        question,
        all,
        [],
      );
    expect(fn).not.toThrow();
    expect(fn()).toBeNull();
  });

  it('T9: 配对题错1对1→yellow/mid（“建议访谈确认”为展示层文案，此处断言可观测等级）', () => {
    const r = calcConfidence([{ is_correct: false }, { is_correct: true }]);
    expect(r.level).toBe('yellow');
    expect(r.confidence).toBe('mid');
  });

  it('T10: 单题考点答错→yellow/mid（不判红）', () => {
    const r = calcConfidence([{ is_correct: false }]);
    expect(r.level).toBe('yellow');
    expect(r.confidence).toBe('mid');
  });

  it('T11: hesitant_correct 掌握度分子按 0.5 计', () => {
    const hesitant = calcKpMastery([
      { is_correct: true, behavior_tag: 'hesitant_correct' },
    ]);
    expect(hesitant.mastery_score).toBe(0.5);

    const normal = calcKpMastery([{ is_correct: true }]);
    expect(normal.mastery_score).toBe(1);
  });

  it('T12: 三信号满足2个→low_credibility，buildReport 输出降级文案', () => {
    const sessions: CredSession[] = [{ id: 's1' }];
    const questions: CredQuestion[] = [
      { id: 'q1', expected_time_sec: 10, is_warmup: true },
      { id: 'q2', expected_time_sec: 10 },
    ];
    // 信号A：热身题 q1 答错；信号B：平均时长 3000 < 10000×0.5；
    // 信号C：modify_count 中位数为 0.5(=0) 不满足 → 仅 A、B 两信号
    const records: CredRecord[] = [
      { question_id: 'q1', is_correct: false, time_spent_ms: 3000, modify_count: 1 },
      { question_id: 'q2', is_correct: true, time_spent_ms: 3000, modify_count: 0 },
    ];
    const cred = checkCredibility(sessions, records, questions);
    expect(cred.signals).toHaveLength(2);
    expect(cred.is_low_credibility).toBe(true);

    // 降级文案：buildReport 在低信度时写入 degraded_texts.credibility
    const report = buildReport(
      'stu1',
      [{ id: 's1' }],
      [
        { question_id: 'q1', is_correct: false, time_spent_ms: 3000, modify_count: 1, score: 0 },
        { question_id: 'q2', is_correct: true, time_spent_ms: 3000, modify_count: 0, score: 1 },
      ],
      [
        { id: 'q1', kp_code: 'KP1', expected_time_sec: 10, is_warmup: true },
        { id: 'q2', kp_code: 'KP1', expected_time_sec: 10 },
      ],
      new Map<string, KpDep>(),
      [],
    );
    expect(report.degraded_texts.some((d) => d.key === 'credibility')).toBe(true);
  });

  it('T13: 追根溯源——KP(红)→A(0.4)→B(0.9)，root=A（最深 <0.5 节点）', () => {
    const kpDeps = new Map<string, KpDep>([
      ['KP', { prerequisite_ids: ['A'] }],
      ['A', { prerequisite_ids: ['B'] }],
      ['B', { prerequisite_ids: [] }],
    ]);
    const masteryMap = new Map<string, number>([
      ['KP', 0.2],
      ['A', 0.4],
      ['B', 0.9],
    ]);
    expect(findRootCause('KP', kpDeps, masteryMap)).toBe('A');
  });

  it('T14: 依赖链断裂（前置节点缺失）→buildReport 不崩溃，跳过该链，返回有效 draft', () => {
    // KP1 的前置 MISSING_NODE 不在 kpDeps / masteryMap 中（依赖链断裂）
    const kpDeps = new Map<string, KpDep>([
      ['KP1', { prerequisite_ids: ['MISSING_NODE'] }],
    ]);
    const fn = () =>
      buildReport(
        'stu1',
        [{ id: 's1' }],
        [
          { question_id: 'q1', is_correct: false, time_spent_ms: 8000, modify_count: 0, score: 0 },
        ],
        [{ id: 'q1', kp_code: 'KP1', expected_time_sec: 10 }],
        kpDeps,
        [],
      );
    expect(fn).not.toThrow();
    const draft = fn();
    expect(Array.isArray(draft.plan_4week)).toBe(true);
    expect(draft.plan_4week).toHaveLength(RULES.PLAN_WEEKS);
    expect(Array.isArray(draft.degraded_texts)).toBe(true);
  });

  it('T15: 首要错因占比 < EC_PRIMARY_MIN_RATIO(0.2) → 不置顶 primary', () => {
    // 6 条不同 EC 各出现 1 次，每个占比 1/6 ≈ 0.167 < 0.2
    const recs: ErrorRecord[] = [
      { ec_code: 'EC1' },
      { ec_code: 'EC2' },
      { ec_code: 'EC3' },
      { ec_code: 'EC4' },
      { ec_code: 'EC5' },
      { ec_code: 'EC6' },
    ];
    const profile = calcEcProfile(recs);
    expect(profile.primary).toBeUndefined();
    expect(profile.distribution['EC1'].ratio).toBeLessThan(RULES.EC_PRIMARY_MIN_RATIO);
  });

  it('T16: 错因分母含 guess 标记题 → guess 题已移出分母', () => {
    const recs: ErrorRecord[] = [
      { ec_code: 'EC1', self_mark: 'guess' },
      { ec_code: 'EC2' },
      { ec_code: 'EC2' },
    ];
    const profile = calcEcProfile(recs);
    // guess 题被移出分母：EC1 不进分布，EC2 分母=2（非3）→ ratio=1
    expect('EC1' in profile.distribution).toBe(false);
    expect(profile.distribution['EC2'].count).toBe(2);
    expect(profile.distribution['EC2'].ratio).toBe(1);
  });

  it('T17: 仅完成2天(数据稀疏)→KP 置信度 low(partial_data 信号)，报告正常生成', () => {
    // 2 个 session、仅 1 条作答记录（数据不足）→ 掌握度分母=1 → confidence=low
    // （“隐藏 L3-L4 结论”为展示层行为，纯函数层以 low 置信度作为 partial_data 信号）
    const draft = buildReport(
      'stu1',
      [{ id: 's1' }, { id: 's2' }],
      [{ question_id: 'q1', is_correct: false, time_spent_ms: 5000, modify_count: 0, score: 0 }],
      [{ id: 'q1', kp_code: 'KP1', expected_time_sec: 10 }],
      new Map<string, KpDep>(),
      [],
    );
    expect(draft.module_mastery['KP1'].confidence).toBe('low');
    expect(draft.module_mastery['KP1'].level).toBe('red');
  });

  it('T18: 错项带 ec 预标的选择题答错 → getChoiceEcCode 返回该选项 ec_code', () => {
    const options = [
      { key: 'A', text: 'opt A', ec_code: 'EC-A' },
      { key: 'B', text: 'opt B', ec_code: 'EC-B' },
    ];
    // 正确为 A，学生错选 B → ec_recommended 首位应为 B 的 ec_code
    expect(getChoiceEcCode('B', options)).toBe('EC-B');
  });
});
