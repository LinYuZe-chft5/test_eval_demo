# Codex_04 规则引擎与算法规格（最高优先级文档）

**版本**：V1.0  **地位**：文档间冲突时以本文件为准。
**总则**：①所有阈值为"待校准"参数，必须定义于 `domain/config/rules.ts` 命名常量，禁止散落硬编码；②本文件所有函数为**纯函数**（无副作用，输入输出明确），每个函数配套单元测试，测试用例即本文件示例。

---

## 1. 全局规则常量（rules.ts 完整清单）

```typescript
// domain/config/rules.ts —— 全部标注 _calibrate 的参数，前200单数据后统一回校
export const RULES = {
  // 作答流程
  DAY_TIME_LIMIT_MIN:      { 1: 30, 2: 35, 3: 40 },     // 每日限时（分钟）
  TIME_WARN_BEFORE_MIN:    5,                            // 交卷前提示
  ACCESS_VALID_DAYS:       7,                            // 激活后作答窗口期
  WARMUP_COUNT_PER_DAY:    2,                            // 每日热身题数

  // 行为判定（_calibrate）
  HESITATE_SWITCH_MIN:     2,     // 选项切换≥N次=犹豫
  FAST_ANSWER_RATIO:       0.4,   // 耗时<预期×N=过快（秒选）
  SLOW_ANSWER_RATIO:       2.0,   // 耗时>预期×N=过慢（卡壳）
  DELETE_REWRITE_MIN:      3,     // 删除重写≥N次=步骤跳脱倾向
  LOW_TIME_RATIO:          0.5,   // 低信度判定：平均时长<预期×N

  // 二次探测（_calibrate）
  PROBE_DIFF_TOLERANCE:    0.05,  // 探测题与原题难度差上限
  PROBE_MAX_PER_SESSION:   3,     // 单日探测题上限（防疲劳）

  // 掌握度（_calibrate）
  MASTERY_GREEN:           0.8,   // 掌握度≥N=绿（掌握）
  MASTERY_YELLOW:          0.5,   // 掌握度≥N=黄（不牢），以下红（薄弱）
  ROOT_CAUSE_THRESHOLD:    0.5,   // 追根溯源：前置节点掌握度<N视为根源候选

  // 低信度答卷（三取二）
  CREDIBILITY_SIGNALS:     3,     // 信号总数
  CREDIBILITY_PASS_MIN:    2,     // 满足N个即标记

  // 报告（_calibrate）
  ADAPT_PASS_SCORE:        75,    // 适应性评定：总分≥N=达标
  ADAPT_BASIC_SCORE:       60,    // ≥N=基本达标，以下待加强
  EC_PRIMARY_MIN_RATIO:    0.2,   // 首要错因最低占比（否则不置顶）
  PLAN_WEEKS:              4,
} as const;
```

---

## 2. 判分规则（grading.ts）

### 2.1 选择题

```text
gradeChoice(studentKey, correctKey): boolean
- 精确匹配（选项key经过乱序映射还原后比对）
- 错因归因辅助：学生所选项若在 options[].ec_code 有预标，写入 ec_recommended 首位
```

### 2.2 填空题答案规范化（关键易错点，必须按下表实现）

```text
normalize(raw, answer_spec): normalizedValue | INVALID
```

| 规则 | 实现 |
|---|---|
| 空白处理 | trim；全角字符转半角；去除内部空格 |
| 分数解析 | 支持"a/b"形式，解析为有理数；禁止浮点直接等值比较，用有理数或容差比较 |
| 小数 | 若 accept_forms 含 decimal：按 decimal_tolerance 容差比较（\|x-std\|≤tol） |
| 分数形式 | 若 accept_forms 含 fraction：与标准答案做有理数等值（约分后相等） |
| π | allow_pi=true 时接受 "π""pi""3.14"（3.14按容差0.005处理）；allow_pi=false 时含π一律判错 |
| 负数/括号 | "-3""(-3)"等价 |
| 单位 | 题干要求带单位时才比对单位，answer_spec.unit 可选 |
| 非法输入 | 无法解析=INVALID → 判错，且 behavior_tag += "invalid_input"（供分析师人工复核，不静默判错） |

**设计原则**：判分规则按题目 answer_spec 字段执行，**禁止全局"智能等价"**。题目未配 answer_spec 的填空题拒绝入库（导入校验）。

### 2.3 分步解答题

```text
gradeStep(stepAnswer, stepDef): { is_correct, score }
- 每个分步输入框独立按该步 answer 与 answer_spec 判分
- 各步独立赋分、独立归因（第n步错=该步对应ec_mapping）
- 步骤间无依赖扣分：第1步错不影响第2步独立判分
- 单题总分 = 各步 score_obtained 之和
```

---

## 3. 行为分析（behavior.ts）：事件 → 记录标签

输入：`answer_events` 时序流；输出：写入 `answer_records` 行为字段与 `behavior_tag`。

### 3.1 字段汇总

```text
time_spent_ms   = submit.ts - enter.ts（剔除 screen_leave 中断时段）
first_action_ms = first_click.ts - enter.ts
modify_count    = fill/step 的内容变更次数（聚焦后值变化计1次）
delete_rewrite_count = 清空重输次数（值从非空变为空再输入）
option_path     = option_select/change 的key序列（乱序前原始key）
revisit_count   = revisit 事件计数
hesitate_flag   = option_path去重切换次数 ≥ HESITATE_SWITCH_MIN
```

### 3.2 行为标签规则（与错因推断的映射，同时输出 ec_recommended）

| 条件（与作答对错联合） | behavior_tag | ec_recommended | 置信度 |
|---|---|---|---|
| time>预期×SLOW 且错 | slow_wrong | EC-K类（取题目ec_mapping中K类） | 高 |
| time<预期×FAST 且错 | fast_wrong | EC-N2 或 EC-C1 | 中 |
| hesitate且错 | hesitate_wrong | EC-C1 | 中 |
| hesitate且对 | hesitant_correct（伪掌握标记） | 不归因，掌握度降级处理（见5.2） | 中 |
| delete_rewrite≥MIN 且对 | rewrite_correct | EC-M2 | 高 |
| 分步第n步错（前步对） | step_break_n | 该步ec_mapping | 高 |
| self_mark=guess | self_guess | 不归因（该题移出错因分母） | — |
| 中途放弃（空白超时） | abandoned | EC-N3 | 中 |

**原则**：行为标签永远与作答对错联合判定，不单独下结论。

---

## 4. 二次探测（probe.ts）

```text
onAnswerGraded(record, question):
  IF record.is_correct
     AND record.time_spent_ms < question.expected_time_sec*1000*FAST_ANSWER_RATIO
     AND 当日已触发探测数 < PROBE_MAX_PER_SESSION
     AND record.self_mark IS NULL:
        probe = 从 questions 选1道：
                  parallel_group_id 相同（优先）
                  或 kp_code 相同 且 |difficulty_est差| ≤ PROBE_DIFF_TOLERANCE
                  且 本session未出现过 且 variant_of≠question.id（排除同母题变式）
                  且 status='active' 且 is_anchor=false
        IF probe存在: 推送（插入当日队列末尾），记录 probe_for=record.id
        ELSE: 标记 record.behavior_tag += "probe_unavailable"（进分析师复核）

onProbeGraded(probeRecord):
  IF NOT probeRecord.is_correct:
     原题记录.probe_result = "confirmed_guess"
     原题掌握度贡献=0（见5.2）
     原题.behavior_tag += "guess_tendency"
  ELSE:
     原题记录.probe_result = "confirmed_mastered"（正常计入）
```

**禁止**：探测题难度高于原题（"难度+1"逻辑已否决——蒙对者做更难题必错，验证失效）。

---

## 5. 掌握度判定（mastery.ts）

### 5.1 考点掌握度

```text
考点kp的掌握度 = 有效得分题数 / 有效题数
  有效题：该kp下所有非热身题（含探测题）
  排除：self_mark=guess、invalid_input、abandoned（移出分母）
  探测修正：probe_result=confirmed_guess的原题按0分计入分子；
           hesitant_correct按0.5计入分子（伪掌握降级）
按 kp_code 聚合后映射到 module（kp_dependencies.module）
```

### 5.2 置信度（信度配对题规则）

```text
IF 考点kp有配对题（pairing_id组内≥2题）:
    全错 → level=red,   confidence=high（知识缺口）
    错1对1 → level=yellow, confidence=mid（掌握不牢/偶发失误，报告标注"建议访谈确认"）
    全对 → level=green, confidence=high
ELSE（单题考点）:
    对 → green/mid；错 → yellow/mid（单题不足以判红）
```

### 5.3 等级映射

```text
掌握度 ≥ MASTERY_GREEN → green
       ≥ MASTERY_YELLOW → yellow
       否则 → red
最终 level = min(掌握度等级, 置信度规则等级)（取较差者）
```

---

## 6. 错因分布与报告组装

### 6.1 错因分布（ecProfile.ts）

```text
分母 = 已归因错题数（is_correct=false 且 ec_final/ec_recommended 非空；
      排除 self_mark=guess、abandoned、invalid_input）
每个EC编码占比 = 该编码出现次数 / 分母（一题多编码时分别计数，注明占比和可>100%）
首要错因 primary = 占比最高且 ≥ EC_PRIMARY_MIN_RATIO 的一级编码下最高二级编码
次要错因 secondary = 次高
输出 distribution 供分析师复核调整（调整写 ec_final，留痕）
```

### 6.2 路径定序与追根溯源（pathEngine.ts）

```text
输入：薄弱考点集 R = {kp | level=red 或 (yellow且confidence=high)}
Step1 追根溯源：对每个 kp∈R，
      沿 kp_dependencies.prerequisite_ids 递归下探，
      取该链上掌握度 < ROOT_CAUSE_THRESHOLD 的最深节点 root(kp)；
      若无更深薄弱前置，则 root(kp)=kp自身
Step2 拓扑排序：对 {root(kp)} 按依赖关系拓扑排序
      （前置掌握度越低越先；同层按模块权重降序）
Step3 4周分配：排序后序列按周切片（PLAN_WEEKS=4），
      每周1-2个焦点考点 + 对应方法卡（由该考点主要错因ec查method_cards）
      + 变式题（questions.variant_stem）
约束：依赖链断裂（前置未在表中）时跳过并记录 degraded_texts
```

### 6.3 低信度答卷（credibility.ts，报告组装前必跑）

```text
信号A = 热身题答错≥1（三日合计）
信号B = 全卷平均 time_spent < 全卷平均 expected_time × LOW_TIME_RATIO
信号C = 修改率异常（modify_count全卷中位数=0 且 平均time<预期×0.7）
满足≥ CREDIBILITY_PASS_MIN(2) 个 →
  session.credibility_flag="low_credibility"
  report.confidence_flags += "low_credibility"
  report.degraded_texts.header = "本次作答数据可信度有限，结论仅供参考，建议安排复核访谈"
```

### 6.4 报告数据契约（reportBuilder.ts 输出，与DDL reports表字段一一对应）

```typescript
interface ReportDraft {
  total_score: number;                    // 三日总分
  adaptive_level: "达标"|"基本达标"|"待加强";  // 按 ADAPT_PASS/BASIC_SCORE
  module_mastery: Array<{                 // 第二段：雷达图
    module: string;                       // 数与代数/图形与几何/统计与概率
    score: number;                        // 0-100掌握度
    level: "green"|"yellow"|"red";
    confidence: "high"|"mid";
    kp_detail: Array<{ kp_code, kp_name, level, confidence }>;
  }>;
  literacy_radar: Array<{ literacy: string; score: number }>; // 第三段
  ec_profile: {                           // 第四段
    primary?:   { code: string; name: string; ratio: number;
                  method_card_id: number };  // 关联方法卡
    secondary?: { code: string; name: string; ratio: number;
                  method_card_id: number };
    distribution: Array<{ code: string; name: string; ratio: number }>;
    low_confidence_notes: string[];       // "建议访谈确认"条目
  };
  plan_4week: Array<{                     // 第六段
    week: number; focus_kp: string[]; method_card_ids: number[];
    practice_question_ids: number[];      // 变式题
  }>;
  action_checklist: Array<{               // 第七段（第4项固定复测预约）
    seq: number; text: string; type: "practice"|"video"|"redo"|"retest";
  }>;
  confidence_flags: string[];             // low_credibility/probe_guess/partial_data
  degraded_texts: Record<string, string>; // 降级文案位：
      // norm_missing="常模数据积累中，本期不展示同龄比较"
      // low_credibility / partial_data（三天未完成时）
  narrative_text: null;                   // MVP由分析师后台填写，未填前端隐藏第五段
}
```

### 6.5 部分数据报告（三天未完成）

```text
Day1/2完成但Day3超窗口期未完成 → 仍组装报告：
  confidence_flags += "partial_data"
  degraded_texts.header = "本报告基于不完整作答数据（完成N/3天）"
  Day3涉及的认知层级L3-L4结论不输出
```

---

## 7. 单元测试用例清单（必须全部通过）

| # | 用例 | 预期 |
|---|---|---|
| T1 | gradeFill(" １／２ ", fraction) | 全角转半角，判对 |
| T2 | gradeFill("0.5", fraction-only) | 无decimal形式→判错 |
| T3 | gradeFill("0.51", decimal, tol=0.01, std=0.5) | \|0.51-0.5\|=0.01≤tol→判对 |
| T4 | gradeFill("3.14", allow_pi=false) | 判错 |
| T5 | gradeFill("abc", any) | INVALID+invalid_input标签 |
| T6 | 分步题第1步错第2步对 | 第2步独立得分 |
| T7 | 耗时0.4×预期-1秒答对 → 触发探测；探测答错 | 原题confirmed_guess，掌握度贡献=0 |
| T8 | 探测池无同难度题 | probe_unavailable，不报错 |
| T9 | 配对题错1对1 | yellow+mid+"建议访谈确认" |
| T10 | 单题考点答错 | yellow+mid（不判红） |
| T11 | hesitant_correct | 分子按0.5计 |
| T12 | 三信号满足2个 | low_credibility+降级文案 |
| T13 | 追根溯源：kp掌握度红，其前置A(0.4)<0.5、A的前置B(0.9) | root=A（最深<0.5节点） |
| T14 | 依赖链断裂 | 跳过该链+degraded_texts记录，不崩溃 |
| T15 | 首要错因占比<0.2 | 不置顶primary |
| T16 | 错因分母含guess标记题 | guess题已移出分母 |
| T17 | 仅完成2天 | partial_data+隐藏L3-L4结论 |
| T18 | 错项带ec预标的选择题答错 | ec_recommended首位=该选项ec_code |

---

## 8. 明确不实现（V2预留接口注释）

```text
// TODO-V2: CAT自适应选题（当前按蓝皮书固定题序）
// TODO-V2: IRT参数计算（当前用questions.difficulty_est预估值）
// TODO-V2: AI叙述段生成（当前narrative_text由分析师填写）
// TODO-V2: 6维学生画像聚合（belief_state表未建）
// TODO-V2: 干预包推送与等值后测（L3验证闭环）
```
