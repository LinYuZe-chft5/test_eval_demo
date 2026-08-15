# 进阶开发执行手册 SOP（V2.0）

> 创建时间：2026-08-15
> 项目：H5线上学科诊断验证应用 — 多身份多题库进阶版
> 基础：在已跑通的 MVP（S1单一题库+固定访问码）之上做进阶优化

---

## 一、进阶目标

| 维度 | MVP（已完成） | 进阶版（本次） |
|---|---|---|
| 用户身份 | 单一（小升初） | 三选一（初一/初二/初三） |
| 访问码 | 预生成8位随机码 | 用户自定义，唯一标识 |
| 题库 | S1（49题） | S1+S3+S6（127题） |
| 数据隔离 | 单一用户 | 多用户隔离（按访问码） |
| 注册流程 | 无（直接输入预生成码） | 首次注册+后续登录 |

## 二、身份-题库映射

| 身份 | SKU编码 | 题库 | 题量 | Day1 | Day2 | Day3 |
|---|---|---|---|---|---|---|
| 初一 | S1_XIAOSHENGCHU_MATH | 小升初数学 | 49 | 22 | 18 | 9 |
| 初二 | S3-01 | 七升八数学 | 41 | 15 | 15 | 11 |
| 初三 | S6-01 | 中考一轮数学 | 37 | 17 | 12 | 8 |

## 三、数据库变更方案

### 3.1 现有表结构分析

DDL（Codex_03）是数据库唯一事实来源。现有关键表：

- `access_codes`: code VARCHAR(8) — 需改为用户自定义长度
- `students`: grade VARCHAR(16) — 已有年级字段
- `questions`: sku_code VARCHAR(32) — 已支持多SKU
- `test_sessions`: student_id + sku_code + day_tag — 已支持隔离

### 3.2 变更方案（ALTER TABLE 迁移）

```sql
-- V2 迁移脚本
-- 1. 扩展 access_codes.code 字段长度（8→32）
ALTER TABLE access_codes ALTER COLUMN code TYPE VARCHAR(32);

-- 2. 新增 identity 字段（身份选择）
ALTER TABLE access_codes ADD COLUMN identity VARCHAR(16);

-- 3. 新增 nickname 字段（用户自定义昵称）
ALTER TABLE access_codes ADD COLUMN nickname VARCHAR(32);
```

### 3.3 不需要新建表

现有 DDL 已完全支持多题库+多用户隔离：
- `questions.sku_code` 区分 S1/S3/S6
- `test_sessions.student_id` 区分不同用户
- `answer_records.session_id` 关联到具体会话
- `reports.student_id + sku_code` 区分报告

## 四、API 变更方案

| API | 方法 | 变更 | 说明 |
|---|---|---|---|
| /api/access/register | POST | **新增** | 注册访问码（身份+访问码+昵称） |
| /api/access/verify | POST | **修改** | 增加身份参数，返回SKU+进度 |
| /api/session/start | POST | **微调** | 从verify结果获取sku_code |
| /api/session/submit | POST | 不变 | 已按session_id隔离 |
| /api/report/get | GET | 不变 | 已按student_id隔离 |

### 4.1 注册API逻辑

```
POST /api/access/register
Body: { identity: "初一"|"初二"|"初三", access_code: string, nickname?: string }

1. 校验 access_code 非空、长度4-32、无SQL注入字符
2. 校验 identity ∈ {初一, 初二, 初三}
3. 查 access_codes 表是否已存在该 code
   - 已存在 → 返回 { ok: false, error: "该访问码已注册" }
   - 不存在 → 创建记录
4. 根据 identity 映射 sku_code
   - 初一 → S1_XIAOSHENGCHU_MATH
   - 初二 → S3-01
   - 初三 → S6-01
5. 创建 access_codes 记录 + students 记录
6. 返回 { ok: true, data: { student_id, sku_code, identity } }
```

### 4.2 验证API逻辑

```
POST /api/access/verify
Body: { access_code: string }

1. 查 access_codes 表
   - 不存在 → 返回 { ok: true, data: { valid: false, error: "访问码不存在，请先注册" } }
   - 存在 → 继续
2. 获取 student_id
3. 查 test_sessions 获取已完成天数
4. 返回 { ok: true, data: { valid: true, student_id, sku_code, identity, completed_days } }
```

## 五、前端变更方案

### 5.1 首页重构

```
┌─────────────────────────────┐
│       📊 学科诊断系统         │
│   三天分阶段诊断 · 精准定位    │
└─────────────────────────────┘
┌─────────────────────────────┐
│  选择身份                     │
│  [初一] [初二] [初三]         │
├─────────────────────────────┤
│  访问码（唯一标识）            │
│  [________________]          │
│  昵称（选填）                  │
│  [________________]          │
├─────────────────────────────┤
│  [注册并开始]  [已注册直接登录] │
└─────────────────────────────┘
```

### 5.2 诊断页

无需大改，已通过 `session_id` 获取题目，自动适配不同 SKU。

### 5.3 报告页

无需大改，已通过 `student_id` 获取报告。

## 六、种子数据导入方案

### 6.1 S3 数据（41题）

来源：`进阶开发资料/Codex_05_S3-01_七年级数学_七升八.json`

字段映射：
- question_id → 保持原值（S3-01-D1-01）
- sku_code → "S3-01"
- day_tag → 直接映射
- q_type → choice/fill/step
- options → JSONB
- 其他字段 → 直接映射

### 6.2 S6 数据（37题）

来源：`进阶开发资料/Codex_05_S6-01_七年级数学_中考一轮.json`

字段映射同 S3，sku_code → "S6-01"

### 6.3 LaTeX 转义处理

S3/S6 JSON 中的 LaTeX 命令（如 `\times`, `\frac`）需确保反斜杠正确转义。

## 七、安全措施

| 风险 | 措施 |
|---|---|
| SQL注入 | Supabase REST API 使用参数化查询，前端输入长度限制+字符过滤 |
| 访问码重复 | 数据库 UNIQUE 约束 + API 层先查后插 |
| 空值 | 前端+API双重校验 |
| 跨用户数据泄露 | 所有查询都带 student_id 条件 |

## 八、开发流程（严格按步执行）

### 每一步的执行规范：
1. 编码实现
2. 自验证（curl/单元测试）
3. 输出交付物清单
4. 等待用户审核
5. 审核通过 → git commit + push
6. 进入下一步

### 开发阶段：

| 阶段 | 内容 | 交付物 |
|---|---|---|
| Phase 1 | 数据库迁移+S3/S6种子数据导入 | 迁移SQL+种子JSON+导入脚本+验证截图 |
| Phase 2 | API重构（register+verify） | API代码+curl测试结果 |
| Phase 3 | 前端重构（首页+诊断页+报告页） | 页面代码+浏览器截图 |
| Phase 4 | 单元测试+集成测试 | 测试代码+测试结果 |
| Phase 5 | Codespaces部署+Vercel部署 | 公网访问地址 |

## 九、Git 提交规范

```
[Phase1-DB] 数据库迁移+S3/S6种子数据导入
[Phase2-API] 访问码注册/验证API重构
[Phase3-FE] 首页身份选择+访问码填写重构
[Phase4-TEST] 单元测试+API集成测试
[Phase5-DEPLOY] Codespaces+Vercel部署
```

## 十、关键约束（继承MVP）

1. DDL是数据库唯一事实来源，禁止反向改
2. 规则引擎纯函数不变（grading/behavior/mastery等）
3. 测量学红线不变（零反馈/回翻只读/填空按answer_spec/探测同难度/低信度三取二）
4. Supabase REST API 模式不变（HTTPS 443）
5. LaTeX 反斜杠转义处理不变
