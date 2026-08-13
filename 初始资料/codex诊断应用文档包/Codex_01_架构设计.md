# Codex_01 架构设计文档

**版本**：V1.0（MVP验证应用）
**配套文档**：Codex_00总控提示词 / Codex_02 PRD / Codex_03 DDL / Codex_04 规则引擎规格 / Codex_05 题库数据格式

---

## 1. 系统全景

```text
┌──────────────────────────────────────────────────────────┐
│                     用户层（移动端H5）                     │
│  学生端：访问码入口 → 3天作答 → 完成页                     │
│  家长端：报告链接 → 报告查看 → 反馈问卷                    │
│  分析师端：后台（报告复核/题库导入/数据看板/访问码管理）    │
└──────────────────────────┬───────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────┐
│              Next.js App Router（Route Handlers）          │
│  /api/session/*    作答会话与进度                          │
│  /api/answer/*     作答提交与行为事件批量接收                │
│  /api/probe/*      二次探测题调度                          │
│  /api/report/*     报告组装、复核、发布、展示                │
│  /api/feedback/*   反馈问卷                                │
│  /api/admin/*      后台管理（题库导入/访问码/导出）          │
└──────────────────────────┬───────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────┐
│                    领域服务层（纯函数，可单测）              │
│  grading.ts      判分（选择/填空规范化/分步小问）           │
│  behavior.ts     行为分析（犹豫/秒选/低信度答卷）           │
│  probe.ts        二次探测调度                              │
│  mastery.ts      掌握度判定与置信度                         │
│  ecProfile.ts    错因分布与归因                             │
│  pathEngine.ts   路径定序（拓扑排序+追根溯源）              │
│  reportBuilder.ts 报告组装（七段式数据契约）                │
│  config/rules.ts 全部阈值常量（唯一参数来源）               │
└──────────────────────────┬───────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────┐
│              PostgreSQL（Supabase）                        │
│  表结构以 Codex_03_数据库DDL.sql 为唯一事实来源             │
└──────────────────────────────────────────────────────────┘
```

## 2. 模块清单与职责

| 模块 | 类型 | 职责 | 关键约束 |
|---|---|---|---|
| access | API | 访问码校验、学生建档、三天解锁控制 | 免注册；一码一生 |
| session | API+前端 | 作答会话、一屏一题、回翻只读、断点续答 | 会话状态机见§4 |
| grading | 纯函数 | 判分与答案规范化 | 规则见Codex_04第2章 |
| behavior | 纯函数 | 行为事件分析、标签生成 | 阈值全部来自rules.ts |
| probe | 纯函数+API | 低置信度作答触发平行题探测 | 同考点同难度 |
| mastery | 纯函数 | 考点掌握度（红/黄/绿）+置信度 | 信度配对题规则 |
| ecProfile | 纯函数 | 错因分布（EC编码聚合） | 分母=已归因错题 |
| pathEngine | 纯函数 | 4周计划拓扑排序+追根溯源 | 依赖kp_dependencies |
| reportBuilder | 纯函数 | 组装报告草稿（JSON数据契约） | AI叙述字段留空 |
| admin | API+页面 | 复核/编辑/发布/导入/导出 | 报告必须经人工发布 |
| feedback | API+页面 | NPS问卷、付费意愿、复测意向 | 验证核心，不可裁剪 |

## 3. 核心数据流

### 3.1 作答流（学生）

```text
访问码校验 → 创建/恢复 test_session（day=1）
  → 拉取当日题目（按蓝皮书固定题序，选项顺序随机化并记录）
  → 逐题作答：前端采集行为事件（进入/首击/修改/切换/提交时间戳）
  → 行为事件本地缓冲，每10秒或切题时批量POST /api/answer/events
  → 提交单题答案 → grading判分 → behavior打标签
  → 若触发低置信度规则 → probe返回1道平行题（插入当日末尾）
  → 当日全部完成 → 更新session状态 → 中性完成页（无分数）
  → Day2/Day3 到期解锁（或运营手动解锁）
```

### 3.2 报告流（Day3完成后）

```text
Day3 session提交
  → mastery：按考点聚合正误+探测结果+配对题 → 掌握度+置信度
  → ecProfile：按EC编码聚合已归因错题 → 首要/次要错因
  → pathEngine：薄弱考点 → 追根溯源（依赖链下探）→ 拓扑排序4周计划
  → reportBuilder：组装报告草稿 status=draft
  → 分析师后台复核（可编辑叙述段/调整错因/改写建议）→ status=published
  → 生成家长报告链接 → 家长查看 → 填写反馈问卷
```

### 3.3 数据可信度前置（组装前必跑）

```text
IF 热身题答错 AND 全卷平均时长<预期50% AND 修改率异常（三取二）
  → report.confidence_flags += "low_credibility"
  → 报告首段输出降级文案（"本次数据可信度有限"），正常段落仍生成但加标注
```

## 4. 会话状态机

```text
test_session.status:
  locked      未解锁（Day2/Day3初始态）
  available   可开始
  in_progress 作答中（含中断恢复）
  submitted   已提交（当日完成，不可再改）

学生三天流程：
  Day1 submitted 且到达 unlock_day2_at → Day2: locked→available
  Day2 submitted 且到达 unlock_day3_at → Day3: locked→available
  全部submitted → 触发报告组装队列

中断恢复：in_progress会话在有效期内重新进入时，恢复至最后作答题（含已缓冲事件）。
有效期：访问码激活后7天（规则常量 ACCESS_VALID_DAYS=7）。
```

## 5. 前端页面清单（移动端H5）

| 路由 | 页面 | 要点 |
|---|---|---|
| /[code] | 访问码入口+须知 | 数据告知语、学生昵称建档、设备检测 |
| /test/[day] | 作答页 | 一屏一题、KaTeX渲染、禁止左右滑、进度条（仅进度无分数） |
| /test/[day]/done | 当日完成页 | 中性反馈："已完成X/3天，答题专注度良好" |
| /test/blocked | 未解锁页 | "明天再来"+完成进度图标 |
| /report/[token] | 家长报告页 | 七段式、雷达图（Recharts）、降级文案位 |
| /report/[token]/feedback | 反馈问卷 | NPS+付费意愿+复测意向+开放题 |
| /admin/* | 分析师后台 | 见PRD第6章（桌面端适配即可） |

**交互强制规范**（测量学红线，PRD第5章详述）：
- 作答中禁止任何能力/分数反馈；
- 允许回翻但已提交题目只读禁改；
- 单题提交后显示"已提交"中性状态（不显示对错）；
- 每题提供"我不会/蒙的"标记按钮（不改变作答，仅记录）。

## 6. 安全与隐私（MVP级）

- 访问码：8位随机码，一次性绑定学生，有效期7天，服务端校验；
- 报告链接：不可枚举token（nanoid 21位）；
- 后台：单一管理员账号（环境变量配置），MVP不做权限体系；
- 数据最小化：仅收集昵称（非真名）、年级；不留身份证号等敏感信息；
- 首屏数据告知文案固定展示（PRD第5章）；
- 防滥用：同一IP单小时创建session上限10个（规则常量）。

## 7. 非功能性指标

| 指标 | 要求 |
|---|---|
| 首屏加载 | ≤3秒（4G网络） |
| 单题提交响应 | ≤1秒 |
| 报告组装 | ≤5秒（纯规则计算，无外部调用） |
| 并发 | 100同时在线（种子规模上限） |
| 断点续答 | 中断后7天内可恢复 |
| 埋点上报 | 批量压缩（每10秒或切题），禁止逐条POST |

## 8. 目录结构约定

```text
app/
  [code]/page.tsx              # 入口
  test/[day]/page.tsx          # 作答
  report/[token]/page.tsx      # 报告
  report/[token]/feedback/     # 问卷
  admin/                       # 后台
  api/                         # route handlers
domain/                        # 纯函数领域服务（全部可单测）
  grading.ts behavior.ts probe.ts mastery.ts
  ecProfile.ts pathEngine.ts reportBuilder.ts
  config/rules.ts              # 全部阈值常量
lib/
  db.ts                        # Prisma client
  katex.ts
scripts/
  seed_questions.ts            # 题库JSON导入（格式见Codex_05）
  gen_access_codes.ts
prisma/schema.prisma           # 由DDL生成
docs/                          # 本文档包（随仓库交付）
```
