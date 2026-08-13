# Codex_05 题库与内容数据格式（导入Schema+样例）

**版本**：V1.0  **用途**：题库JSON导入文件（scripts/seed_questions.ts）与后台导入接口的唯一格式标准；导入前必须通过本Schema校验，错误行级报错。

---

## 1. 题库导入文件结构

```jsonc
{
  "sku_code": "S1_XIAOSHENGCHU_MATH",
  "version": "v1.0",
  "blueprint": { /* 见第3章：蓝皮书对象，首次导入时写入blueprints表 */ },
  "kp_dependencies": [ /* 见第4章：前置依赖，写入kp_dependencies表 */ ],
  "method_cards": [ /* 见第5章：方法卡，写入method_cards表 */ ],
  "questions": [ /* 见第2章：题目数组 */ ]
}
```

## 2. 题目对象Schema（questions[]）

| 字段 | 类型 | 必填 | 校验规则 |
|---|---|---|---|
| day_tag | int | ✅ | 1/2/3 |
| seq_no | int | ✅ | 当日内唯一且连续 |
| q_type | string | ✅ | "choice"/"fill"/"step" |
| is_warmup | bool | | 默认false；热身题每天=2道，超出报错 |
| stem | string | ✅ | 支持KaTeX（$...$与$$...$$） |
| image_url | string | | 图形题必填；且stem须含图形条件文字复述 |
| options | array | choice必填 | 4项，结构见下；**错误选项必须带ec_code** |
| correct_answer | string | choice/fill必填 | choice填选项key |
| steps | array | step必填 | 2-3个分步，结构见下 |
| answer_spec | object | fill/step必填 | 结构见下；缺失拒绝入库 |
| score | number | ✅ | >0 |
| solution | string | ✅ | 完整解析 |
| kp_code | string | ✅ | 须存在于kp_dependencies |
| kp_related | string | | 同上 |
| cognitive_level | string | ✅ | L1/L2/L3/L4 |
| literacy_codes | string[] | ✅ | 1-2个，YS-01~YS-09 |
| ec_mapping | string[] | ✅ | 1-3个EC编码 |
| difficulty_est | number | ✅ | 0.30~0.90 |
| expected_time_sec | int | ✅ | >0 |
| pairing_id | string | | 配对组编号；同组≥2题 |
| parallel_group_id | string | | 平行题组编号 |
| variant_of_seq | int | | 变式题指向同文件内母题seq_no |
| improvement_tip | string | ✅ | 禁止"加强练习"式空话（导入正则拦截） |
| variant_stem / variant_answer | string | ✅ | 变式题及答案 |

**options[]结构**：`[{ "key":"A", "text":"...", "ec_code":null }, {"key":"B","text":"...","ec_code":"EC-K1"}]`——正确项ec_code为null，每个错误项必须有ec_code。

**steps[]结构**：`[{ "seq":1, "prompt":"第一步：求判别式Δ", "answer":"17", "answer_spec":{...}, "score":4, "ec_mapping":["EC-M1"] }]`

**answer_spec结构**：
```jsonc
{
  "accept_forms": ["fraction"],        // fraction/decimal/integer/expression
  "decimal_tolerance": 0.01,           // accept_forms含decimal时必填
  "allow_pi": false,
  "unit": null                          // 如"cm"，题干要求时填
}
```

## 3. 蓝皮书对象（blueprint）

```jsonc
{
  "sku_code": "S1_XIAOSHENGCHU_MATH",
  "subject": "math",
  "positioning": {                    // 定位卡10字段
    "name": "小升初衔接适应期诊断",
    "target_audience": "七年级新生/开学4-8周",
    "diag_goals": [1, 4],
    "difficulty_baseline": [70, 78],
    "module_weights": [
      {"module":"有理数运算","weight":0.30},
      {"module":"整式加减","weight":0.25},
      {"module":"一元一次方程应用","weight":0.25},
      {"module":"小学前置","weight":0.20}
    ],
    "report_focus": ["能否适应初中节奏","计算习惯是否过关","应用题理解能力"],
    "升学关联": "中",
    "prerequisite_scope": ["KP-P.分数四则混合运算","KP-P.简易方程"],
    "reference_type": "criterion",
    "retest_sku": "S2_QISHANG_MIDTERM_MATH"
  },
  "day_modules": [
    {"day":1,"title":"基础能力扫描","time_limit_min":30,"cognitive_range":["L1","L2"]},
    {"day":2,"title":"应用能力诊断","time_limit_min":35,"cognitive_range":["L2","L3"]},
    {"day":3,"title":"综合与思维诊断","time_limit_min":40,"cognitive_range":["L3","L4"]}
  ]
}
```

## 4. 前置依赖对象（kp_dependencies[]）

```jsonc
{ "kp_code":"KP-05.3", "kp_name":"解一元一次方程",
  "module":"数与代数",
  "prerequisite_ids":["KP-04.3","KP-P.等式性质"] }
```
注：小学前置考点以 `KP-P.` 前缀编码（下探层），同样入表。

## 5. 方法卡对象（method_cards[]）

```jsonc
{
  "ec_code": "EC-M1",
  "method_name": "慢算训练法",
  "method_content": "每天10分钟，强制书写每一步运算过程，禁用口算；完成后用逆运算回验",
  "path_4week": {"w1":"整式运算慢算","w2":"方程求解慢算","w3":"限时准算","w4":"综合运算"},
  "contraindication": "不适用于答题时间严重不足的学生——先用草稿分区法",
  "verification_metric": "4周后复测，运算类错因占比降至15%以下视为有效",
  "version": "v1.0", "reviewed_by": "终审教师姓名"
}
```

## 6. 完整题目样例（三种题型各一，可直接作种子数据）

```json
{
  "sku_code": "S1_XIAOSHENGCHU_MATH",
  "version": "v1.0",
  "kp_dependencies": [
    {"kp_code":"KP-01.11","kp_name":"有理数的混合运算","module":"数与代数","prerequisite_ids":["KP-01.8","KP-01.10"]},
    {"kp_code":"KP-01.8","kp_name":"有理数的乘法","module":"数与代数","prerequisite_ids":["KP-P.分数乘法"]},
    {"kp_code":"KP-01.10","kp_name":"有理数的乘方","module":"数与代数","prerequisite_ids":["KP-01.8"]},
    {"kp_code":"KP-P.分数乘法","kp_name":"分数乘法（小学前置）","module":"数与代数","prerequisite_ids":[]}
  ],
  "method_cards": [
    {"ec_code":"EC-M1","method_name":"慢算训练法","method_content":"每天10分钟，强制书写每一步，禁用口算，逆运算回验","path_4week":{"w1":"整式慢算","w2":"方程慢算","w3":"限时准算","w4":"综合运算"},"contraindication":"时间严重不足者先用草稿分区法","verification_metric":"4周后运算类错因占比≤15%","version":"v1.0","reviewed_by":"待填"}
  ],
  "questions": [
    {
      "day_tag": 1, "seq_no": 1, "q_type": "choice", "is_warmup": true,
      "stem": "$-3$ 的相反数是（ ）",
      "options": [
        {"key":"A","text":"$-3$","ec_code":"EC-K1"},
        {"key":"B","text":"$3$","ec_code":null},
        {"key":"C","text":"$\\frac{1}{3}$","ec_code":"EC-K2"},
        {"key":"D","text":"$-\\frac{1}{3}$","ec_code":"EC-K2"}
      ],
      "correct_answer": "B", "score": 0,
      "solution": "只有符号不同的两个数互为相反数，-3的相反数是3，选B。",
      "kp_code": "KP-01.3", "cognitive_level": "L1",
      "literacy_codes": ["YS-01"], "ec_mapping": ["EC-K1"],
      "difficulty_est": 0.90, "expected_time_sec": 20,
      "improvement_tip": "用数轴标示-3与3的位置，直观理解相反数关于原点对称",
      "variant_stem": "$-5$ 的相反数是（ ）", "variant_answer": "5"
    },
    {
      "day_tag": 1, "seq_no": 5, "q_type": "fill",
      "stem": "计算：$(-2)^3 + 4 \\times (-\\frac{1}{2}) = $ ______（结果保留分数形式）",
      "correct_answer": "-9",
      "answer_spec": {"accept_forms":["integer"],"allow_pi":false},
      "score": 3,
      "solution": "(-2)³=-8；4×(-1/2)=-2；-8+(-2)=-10。注意先乘方再乘法最后加法。",
      "kp_code": "KP-01.11", "cognitive_level": "L2",
      "literacy_codes": ["YS-02"], "ec_mapping": ["EC-M1","EC-K2"],
      "difficulty_est": 0.75, "expected_time_sec": 90,
      "pairing_id": "PAIR-YOULISHU-01", "parallel_group_id": "PG-YOULISHU-01",
      "improvement_tip": "在草稿纸上写出完整三步：乘方→乘法→加法，每步一行",
      "variant_stem": "计算：$(-3)^2 - 6 \\times \\frac{1}{3} = $ ______", "variant_answer": "7"
    },
    {
      "day_tag": 2, "seq_no": 14, "q_type": "step",
      "stem": "某商店将进价为每件40元的商品按标价的八折出售，仍获利20%。求该商品的标价。（分步作答）",
      "steps": [
        {"seq":1,"prompt":"第一步：设标价为$x$元，用含$x$的式子表示售价","answer":"0.8x","answer_spec":{"accept_forms":["expression"]},"score":3,"ec_mapping":["EC-M4"]},
        {"seq":2,"prompt":"第二步：根据'获利20%'列方程并求解$x$","answer":"60","answer_spec":{"accept_forms":["integer"]},"score":5,"ec_mapping":["EC-M1","EC-K4"]}
      ],
      "score": 8,
      "solution": "售价0.8x，利润=0.8x-40=40×20%=8，解得0.8x=48，x=60。标价60元。",
      "kp_code": "KP-05.4", "kp_related": "KP-04.1", "cognitive_level": "L3",
      "literacy_codes": ["YS-07","YS-08"], "ec_mapping": ["EC-M3","EC-M4"],
      "difficulty_est": 0.55, "expected_time_sec": 240,
      "pairing_id": "PAIR-FANGCHENG-02",
      "improvement_tip": "用'进价×(1+利润率)=售价'模型卡片重做本题，再口述一遍等量关系",
      "variant_stem": "进价60元，按标价九折出售获利20%，求标价（分步）", "variant_answer": "80"
    }
  ]
}
```

## 7. 导入校验规则（seed_questions.ts 必实现）

1. JSON Schema整体验证，错误输出行号+字段名；
2. kp_code必须存在于kp_dependencies（含KP-P.前缀）；
3. choice题：恰4个选项、唯一正确项、**每个错误项带ec_code**；
4. fill/step题：answer_spec必填且accept_forms非空；
5. improvement_tip拦截空话正则：`/^加强|多练|认真|注意/ `命中即拒绝；
6. stem_hash查重：与库中已有题目hash冲突→报告冲突行；
7. 每日热身题恰好2道；day题量与blueprint.day_modules一致；
8. pairing_id组内≥2题；parallel_group_id组内难度极差≤0.05。

## 8. 样例说明

第6章样例仅为格式演示（3题），正式种子题库须按产品总规范附录A提示词命题、经终审后转换为本格式。**验证应用上线最低题量**：Day1=22题（含2热身）、Day2=18题、Day3=15题，另加每TOP考点≥3道平行题入池供二次探测调用。
