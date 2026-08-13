/**
 * domain/engine/__tests__/grading.test.ts
 * Codex_04 规则引擎 - 判分规则单元测试
 * 18个测试用例覆盖：选择题、填空题(分数/小数/π)、分步题
 */
import { describe, it, expect } from 'vitest';
import {
  gradeChoice,
  getChoiceEcCode,
  normalize,
  gradeFill,
  gradeStep,
  gradeSteps,
  type AnswerSpec,
  type Option,
  type StepDef,
} from '../grading';

// ===== 选择题 =====
describe('gradeChoice - 选择题判分', () => {
  it('精确匹配', () => {
    expect(gradeChoice('A', 'A')).toBe(true);
  });
  it('大小写不敏感', () => {
    expect(gradeChoice('a', 'A')).toBe(true);
    expect(gradeChoice('B', 'b')).toBe(true);
  });
  it('空格容忍', () => {
    expect(gradeChoice(' A ', 'A')).toBe(true);
  });
  it('错误选项', () => {
    expect(gradeChoice('B', 'A')).toBe(false);
  });
  it('null/undefined安全', () => {
    expect(gradeChoice(null as any, 'A')).toBe(false);
    expect(gradeChoice('A', undefined as any)).toBe(false);
  });
});

describe('getChoiceEcCode - 选择题错因归因', () => {
  const opts: Option[] = [
    { key: 'A', text: '选项A', ec_code: 'EC-K1' },
    { key: 'B', text: '选项B', ec_code: 'EC-C2' },
    { key: 'C', text: '选项C' },
  ];
  it('返回学生所选项的ec_code', () => {
    expect(getChoiceEcCode('A', opts)).toBe('EC-K1');
    expect(getChoiceEcCode('B', opts)).toBe('EC-C2');
  });
  it('无ec_code返回null', () => {
    expect(getChoiceEcCode('C', opts)).toBeNull();
  });
  it('无效选项返回null', () => {
    expect(getChoiceEcCode('D', opts)).toBeNull();
  });
});

// ===== 填空题 normalize =====
describe('normalize - 填空题答案规范化', () => {
  it('空值→INVALID', () => {
    expect(normalize('', { accept_forms: ['decimal'] })).toEqual({ ok: false, invalid: true });
    expect(normalize('   ', { accept_forms: ['decimal'] })).toEqual({ ok: false, invalid: true });
  });
  it('null→INVALID', () => {
    expect(normalize(null as any, { accept_forms: ['decimal'] })).toEqual({ ok: false, invalid: true });
  });
  it('整数→数值', () => {
    const r = normalize('3', { accept_forms: ['decimal'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(3);
  });
  it('小数→数值', () => {
    const r = normalize('3.14', { accept_forms: ['decimal'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(3.14);
  });
  it('分数→有理数', () => {
    const r = normalize('1/2', { accept_forms: ['fraction'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ num: 1, den: 2 });
  });
  it('负分数→有理数', () => {
    const r = normalize('-3/4', { accept_forms: ['fraction'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ num: -3, den: 4 });
  });
  it('全角转半角', () => {
    const r = normalize('３.１４', { accept_forms: ['decimal'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(3.14);
  });
  it('括号等价 (-3)→-3', () => {
    const r = normalize('(-3)', { accept_forms: ['decimal'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(-3);
  });
  it('allow_pi=true: π接受', () => {
    const r = normalize('π', { accept_forms: ['decimal'], allow_pi: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(Math.PI);
  });
  it('allow_pi=true: pi接受', () => {
    const r = normalize('pi', { accept_forms: ['decimal'], allow_pi: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(Math.PI);
  });
  it('allow_pi=false: π判INVALID', () => {
    const r = normalize('π', { accept_forms: ['decimal'], allow_pi: false });
    expect(r.ok).toBe(false);
    expect(r).toEqual({ ok: false, invalid: true });
  });
  it('非法字符→INVALID', () => {
    const r = normalize('abc', { accept_forms: ['decimal'] });
    expect(r.ok).toBe(false);
    expect(r).toEqual({ ok: false, invalid: true });
  });
  it('单位剥离', () => {
    const r = normalize('5cm', { accept_forms: ['decimal'], unit: 'cm' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(5);
  });
});

// ===== 填空题 gradeFill =====
describe('gradeFill - 填空题判分', () => {
  const fracSpec: AnswerSpec = { accept_forms: ['fraction'] };
  const decSpec: AnswerSpec = { accept_forms: ['decimal'], decimal_tolerance: 0.01 };
  const bothSpec: AnswerSpec = { accept_forms: ['fraction', 'decimal'], decimal_tolerance: 0.01 };

  it('分数等值：1/2 = 2/4', () => {
    const r = gradeFill('1/2', '2/4', fracSpec);
    expect(r.is_correct).toBe(true);
    expect(r.invalid_input).toBe(false);
  });
  it('分数等值：3/6 = 1/2', () => {
    const r = gradeFill('3/6', '1/2', fracSpec);
    expect(r.is_correct).toBe(true);
  });
  it('分数不等值', () => {
    const r = gradeFill('1/3', '1/2', fracSpec);
    expect(r.is_correct).toBe(false);
  });
  it('小数容差内正确', () => {
    const r = gradeFill('3.14', '3.14159', decSpec);
    expect(r.is_correct).toBe(true);
  });
  it('小数超出容差错误', () => {
    const r = gradeFill('3.2', '3.14', decSpec);
    expect(r.is_correct).toBe(false);
  });
  it('双form：分数输入匹配小数答案', () => {
    const r = gradeFill('1/2', '0.5', bothSpec);
    expect(r.is_correct).toBe(true);
  });
  it('非法输入→invalid_input=true', () => {
    const r = gradeFill('abc', '1/2', fracSpec);
    expect(r.is_correct).toBe(false);
    expect(r.invalid_input).toBe(true);
  });
  it('空输入→invalid_input=true', () => {
    const r = gradeFill('', '3.14', decSpec);
    expect(r.is_correct).toBe(false);
    expect(r.invalid_input).toBe(true);
  });
});

// ===== 分步题 =====
describe('gradeStep - 分步题单步判分', () => {
  it('有answer_spec: 按fill规则判', () => {
    const def: StepDef = { seq: 1, prompt: '求解', answer: '1/2', answer_spec: { accept_forms: ['fraction'] }, score: 4 };
    const r = gradeStep('2/4', def);
    expect(r.is_correct).toBe(true);
    expect(r.score).toBe(4);
  });
  it('无answer_spec: 精确匹配', () => {
    const def: StepDef = { seq: 1, prompt: '名称', answer: '勾股定理', score: 3 };
    const r = gradeStep('勾股定理', def);
    expect(r.is_correct).toBe(true);
    expect(r.score).toBe(3);
  });
  it('答错得0分', () => {
    const def: StepDef = { seq: 1, prompt: '求解', answer: '1/2', answer_spec: { accept_forms: ['fraction'] }, score: 4 };
    const r = gradeStep('1/3', def);
    expect(r.is_correct).toBe(false);
    expect(r.score).toBe(0);
  });
});

describe('gradeSteps - 分步题总分', () => {
  const defs: StepDef[] = [
    { seq: 1, prompt: '第一步', answer: '1/2', answer_spec: { accept_forms: ['fraction'] }, score: 3 },
    { seq: 2, prompt: '第二步', answer: '3/4', answer_spec: { accept_forms: ['fraction'] }, score: 4 },
    { seq: 3, prompt: '第三步', answer: '5', answer_spec: { accept_forms: ['decimal'] }, score: 3 },
  ];
  it('全对', () => {
    const r = gradeSteps([{ seq: 1, answer: '2/4' }, { seq: 2, answer: '3/4' }, { seq: 3, answer: '5' }], defs);
    expect(r.total_score).toBe(10);
    expect(r.step_results.every(s => s.is_correct)).toBe(true);
  });
  it('部分对', () => {
    const r = gradeSteps([{ seq: 1, answer: '2/4' }, { seq: 2, answer: '1/2' }, { seq: 3, answer: '5' }], defs);
    expect(r.total_score).toBe(6);
  });
  it('空答得0分', () => {
    const r = gradeSteps([], defs);
    expect(r.total_score).toBe(0);
    expect(r.step_results.length).toBe(3);
  });
});
