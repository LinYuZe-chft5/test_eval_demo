-- ============================================================================
-- H5线上学科诊断验证应用 数据库DDL（PostgreSQL 14+，Supabase兼容）
-- 版本：V1.0 MVP
-- 地位：本文件是数据库结构的唯一事实来源，ORM（Prisma）模型由此生成，禁止反向修改
-- 说明：所有 _calibrate 注释字段为"待校准参数"相关，前200单数据后统一回校
-- ============================================================================

-- ---------- 1. 访问码 ----------
CREATE TABLE access_codes (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(8)  NOT NULL UNIQUE,          -- 8位随机码
    sku_code        VARCHAR(32) NOT NULL,                 -- 关联SKU（蓝皮书）
    status          VARCHAR(16) NOT NULL DEFAULT 'active',-- active/used/expired/disabled
    expires_at      TIMESTAMPTZ NOT NULL,                 -- 生成后默认30天有效（未激活）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_access_codes_sku ON access_codes(sku_code, status);

-- ---------- 2. 学生档案（一码一生，免注册） ----------
CREATE TABLE students (
    id              BIGSERIAL PRIMARY KEY,
    access_code_id  BIGINT      NOT NULL UNIQUE REFERENCES access_codes(id),
    sku_code        VARCHAR(32) NOT NULL,
    nickname        VARCHAR(32) NOT NULL,                 -- 昵称，非真名（数据最小化）
    grade           VARCHAR(16) NOT NULL,                 -- 如 "七年级"
    school          VARCHAR(64),                          -- 选填
    activated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- 激活时间（7天窗口起算）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 3. 蓝皮书（SKU定位卡+试卷结构的结构化存储，组卷读表） ----------
CREATE TABLE blueprints (
    id              BIGSERIAL PRIMARY KEY,
    sku_code        VARCHAR(32) NOT NULL UNIQUE,          -- 如 "S1_XIAOSHENGCHU_MATH"
    subject         VARCHAR(16) NOT NULL DEFAULT 'math',  -- 预留多学科
    -- 定位卡10字段（JSONB整体存储，便于扩展）
    positioning     JSONB       NOT NULL,
    /* positioning 结构：
       { name, target_audience, diag_goals:[1,4], difficulty_baseline:[70,78],
         module_weights:[{module,weight}], report_focus:[],升学关联度,
         prerequisite_scope:[kp_codes], reference_type:"criterion", retest_sku } */
    -- 三天模块结构
    day_modules     JSONB       NOT NULL,
    /* day_modules: [{day:1, title:"基础能力扫描", time_limit_min:30,
                      warmup_question_ids:[], question_ids:[], cognitive_range:["L1","L2"]}] */
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 4. 题库（诊断字段+管理字段合一） ----------
CREATE TABLE questions (
    id              BIGSERIAL PRIMARY KEY,
    sku_code        VARCHAR(32) NOT NULL,
    subject         VARCHAR(16) NOT NULL DEFAULT 'math',
    day_tag         SMALLINT    NOT NULL,                 -- 适用天次 1/2/3
    seq_no          SMALLINT    NOT NULL,                 -- 当日题序（蓝皮书固定序）
    q_type          VARCHAR(16) NOT NULL,                 -- choice/fill/step
    is_warmup       BOOLEAN     NOT NULL DEFAULT FALSE,   -- 热身题标记
    is_anchor       BOOLEAN     NOT NULL DEFAULT FALSE,   -- 锚题（不入普通抽题池）

    -- 题目内容
    stem            TEXT        NOT NULL,                 -- 题干（含KaTeX）
    image_url       TEXT,                                 -- 图形题配图（MVP可空）
    options         JSONB,                                -- choice: [{key:"A",text:"...",ec_code:"EC-K1"}]
                                                          -- 每个错误选项预标错因编码
    steps           JSONB,                                -- step: [{seq:1,prompt:"",answer:"",answer_spec:{},score:4}]
    correct_answer  TEXT,                                 -- choice填key；fill填标准答案
    answer_spec     JSONB,                                -- fill判分规范（见Codex_05）
                                                          -- {accept_forms:["fraction","decimal"],
                                                          --  decimal_tolerance:0.01, allow_pi:false}
    score           NUMERIC(5,1) NOT NULL,
    solution        TEXT        NOT NULL,                 -- 完整解析（报告不展示，后台用）

    -- 诊断字段（命题时填写）
    kp_code         VARCHAR(32) NOT NULL,                 -- 主考点 KP-章.节.技能点
    kp_related      VARCHAR(32),                          -- 关联考点（≤1个）
    cognitive_level VARCHAR(4)  NOT NULL,                 -- L1/L2/L3/L4
    literacy_codes  VARCHAR(32)[],                        -- 主导素养 YS-xx / Sx（1-2个）
    ec_mapping      VARCHAR(8)[],                         -- 预设错因编码（1-3个）
    difficulty_est  NUMERIC(3,2) NOT NULL,                -- 预估难度P 0.30-0.90
    discrimination_est NUMERIC(3,2),                      -- 预估区分度（目标≥0.3）
    expected_time_sec INT       NOT NULL,                 -- 预期作答时长（行为比对基准）_calibrate
    pairing_id      VARCHAR(32),                          -- 信度配对题组编号
    parallel_group_id VARCHAR(32),                        -- 平行题组编号（二次探测/复测调用）
    variant_of      BIGINT      REFERENCES questions(id), -- 变式题的母题
    improvement_tip TEXT,                                 -- 改进建议（方法卡调用键之外的题级建议）
    variant_stem    TEXT,                                 -- 变式题题干（报告练习资源）
    variant_answer  TEXT,

    -- 管理字段（运营回填）
    status          VARCHAR(16) NOT NULL DEFAULT 'candidate', -- candidate/pilot/active/retired
    exposure_count  INT         NOT NULL DEFAULT 0,
    measured_p      NUMERIC(3,2),                         -- 实测P值（试测回填）
    measured_d      NUMERIC(3,2),                         -- 实测区分度
    stem_hash       CHAR(64)    NOT NULL,                 -- 题干SHA256（导入查重）
    version         VARCHAR(8)  NOT NULL DEFAULT 'v1.0',
    reviewer        VARCHAR(32),                          -- 终审人
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sku_code, day_tag, seq_no)
);
CREATE INDEX idx_questions_kp ON questions(kp_code);
CREATE INDEX idx_questions_parallel ON questions(parallel_group_id);
CREATE INDEX idx_questions_pairing ON questions(pairing_id);

-- ---------- 5. 知识点前置依赖表（路径定序+追根溯源数据源） ----------
CREATE TABLE kp_dependencies (
    id              BIGSERIAL PRIMARY KEY,
    kp_code         VARCHAR(32) NOT NULL UNIQUE,          -- 知识点编码
    kp_name         VARCHAR(128) NOT NULL,
    module          VARCHAR(32) NOT NULL,                 -- 数与代数/图形与几何/统计与概率
    prerequisite_ids VARCHAR(32)[] NOT NULL DEFAULT '{}', -- 直接前置考点
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 6. 方法卡（预制干预内容库，人工审核入库） ----------
CREATE TABLE method_cards (
    id              BIGSERIAL PRIMARY KEY,
    ec_code         VARCHAR(8)  NOT NULL,                 -- 对应错因编码
    subject         VARCHAR(16) NOT NULL DEFAULT 'math',
    method_name     VARCHAR(64) NOT NULL,                 -- 如"慢算训练法"
    method_content  TEXT        NOT NULL,                 -- 具体干预方法
    path_4week      JSONB       NOT NULL,                 -- {w1:"",w2:"",w3:"",w4:""}
    contraindication TEXT,                                -- 适用边界/禁忌
    verification_metric TEXT,                             -- 验证指标（效果回流判定）
    version         VARCHAR(8)  NOT NULL DEFAULT 'v1.0',
    reviewed_by     VARCHAR(32),                          -- 审核人
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ec_code, subject)
);

-- ---------- 7. 作答会话（三天流程控制核心） ----------
CREATE TABLE test_sessions (
    id              BIGSERIAL PRIMARY KEY,
    student_id      BIGINT      NOT NULL REFERENCES students(id),
    sku_code        VARCHAR(32) NOT NULL,
    day_tag         SMALLINT    NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'locked',-- locked/available/in_progress/submitted
    started_at      TIMESTAMPTZ,
    submitted_at    TIMESTAMPTZ,
    time_limit_sec  INT         NOT NULL,
    option_orders   JSONB,                                -- {question_id:[B,D,A,C]} 选项乱序记录
    credibility_flag VARCHAR(16),                         -- 低信度标记：low_credibility（三取二判定后写入）
    device_info     JSONB,                                -- {type:"mobile",ua:"",screen:""}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, sku_code, day_tag)
);
CREATE INDEX idx_sessions_student ON test_sessions(student_id, status);

-- ---------- 8. 作答记录（每题一行，判分+行为标签汇总） ----------
CREATE TABLE answer_records (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT      NOT NULL REFERENCES test_sessions(id),
    student_id      BIGINT      NOT NULL REFERENCES students(id),
    question_id     BIGINT      NOT NULL REFERENCES questions(id),
    step_seq        SMALLINT    NOT NULL DEFAULT 1,       -- 分步解答的第几步（非分步题=1）

    -- 作答与判分
    student_answer  JSONB,                                -- choice:"B" / fill:"1/2" / step:"x=3"
    is_correct      BOOLEAN,
    score_obtained  NUMERIC(5,1) NOT NULL DEFAULT 0,

    -- 行为标签（behavior.ts汇总后写入）
    time_spent_ms   INT,                                  -- 停留时长（进入→提交）
    first_action_ms INT,                                  -- 进入→首次点击（犹豫时长）
    modify_count    SMALLINT    NOT NULL DEFAULT 0,
    delete_rewrite_count SMALLINT NOT NULL DEFAULT 0,     -- 删除重写次数（理科关键埋点）
    option_path     VARCHAR(16)[],                        -- 选项切换路径 ["A","B","A"]
    revisit_count   SMALLINT    NOT NULL DEFAULT 0,       -- 回翻次数
    hesitate_flag   BOOLEAN     NOT NULL DEFAULT FALSE,   -- 选项切换≥2次
    self_mark       VARCHAR(8),                           -- 学生主动标记：unknown/guess
    behavior_tag    VARCHAR(32)[],                        -- 系统标签：fast_wrong/slow_wrong/guess_tendency等

    -- 二次探测
    is_probe        BOOLEAN     NOT NULL DEFAULT FALSE,   -- 本行是否为探测题作答
    probe_for       BIGINT      REFERENCES answer_records(id), -- 探测目标记录
    probe_result    VARCHAR(16),                          -- 原题上的探测判决：confirmed_guess（疑似蒙对）

    -- 错因归因（规则预推荐+分析师可改）
    ec_recommended  VARCHAR(8)[],                         -- 系统预推荐错因编码
    ec_final        VARCHAR(8)[],                         -- 最终错因编码（分析师确认/修改）

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_records_session ON answer_records(session_id);
CREATE INDEX idx_records_question ON answer_records(question_id);   -- CTT实测P/D计算用
CREATE INDEX idx_records_student ON answer_records(student_id);

-- ---------- 9. 原始行为事件（批量上报落库，毫秒级时序） ----------
CREATE TABLE answer_events (
    id              BIGSERIAL PRIMARY KEY,
    session_id      BIGINT      NOT NULL REFERENCES test_sessions(id),
    question_id     BIGINT      NOT NULL REFERENCES questions(id),
    step_seq        SMALLINT    NOT NULL DEFAULT 1,
    event_type      VARCHAR(24) NOT NULL,                 -- enter/first_click/option_select/
                                                          -- option_change/delete_rewrite/submit/revisit/mark/screen_leave
    event_payload   JSONB,                                -- {value:"B", ts_offset_ms:1234}
    client_ts       TIMESTAMPTZ NOT NULL,                 -- 客户端时间戳
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()    -- 服务端接收时间
);
CREATE INDEX idx_events_session ON answer_events(session_id, question_id);

-- ---------- 10. 诊断报告 ----------
CREATE TABLE reports (
    id              BIGSERIAL PRIMARY KEY,
    student_id      BIGINT      NOT NULL REFERENCES students(id),
    sku_code        VARCHAR(32) NOT NULL,
    status          VARCHAR(16) NOT NULL DEFAULT 'draft', -- draft/published
    view_token      VARCHAR(32) NOT NULL UNIQUE,          -- 家长查看token（nanoid 21）

    -- 组装数据契约（reportBuilder输出，七段式，见Codex_04第6章）
    total_score     NUMERIC(5,1),
    adaptive_level  VARCHAR(16),                          -- 适应性评定：达标/基本达标/待加强
    module_mastery  JSONB,                                -- [{module,kp_code,level:"red|yellow|green",confidence:"high|mid"}]
    literacy_radar  JSONB,                                -- [{literacy:"YS-02",score:0-100}]
    ec_profile      JSONB,                                -- {primary:{code,name,ratio},secondary:{...},distribution:[...]}
    confidence_flags VARCHAR(32)[],                       -- low_credibility / probe_guess / partial_data
    plan_4week      JSONB,                                -- [{week:1,focus_kp:[],method_card_ids:[],actions:[]}]
    action_checklist JSONB,                               -- 本周行动清单（含复测预约项）
    degraded_texts  JSONB,                                -- 降级文案位（常模缺失/可信度有限）

    -- 分析师复核
    narrative_text  TEXT,                                 -- 个性化段落（MVP人工填写，AI二期）
    analyst_edits   JSONB,                                -- [{field,from,to,editor,ts}] 修改留痕
    reviewed_by     VARCHAR(32),
    published_at    TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, sku_code)
);

-- ---------- 11. 反馈问卷（验证核心模块，禁止裁剪） ----------
CREATE TABLE report_feedback (
    id              BIGSERIAL PRIMARY KEY,
    report_id       BIGINT      NOT NULL REFERENCES reports(id),
    student_id      BIGINT      NOT NULL REFERENCES students(id),
    nps_score       SMALLINT    NOT NULL,                 -- 0-10
    valuable_parts  VARCHAR(32)[],                        -- radar/ec/plan/actions/narrative
    willingness_price VARCHAR(16),                        -- lt68/68_99/99_159/159_199/gt199
    retest_intent   VARCHAR(16),                          -- yes/maybe/no
    open_comment    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (report_id)                                    -- 每份报告仅一次问卷
);

-- ---------- 12. 复测意向（行动清单点击即记录，独立于问卷） ----------
CREATE TABLE retest_intents (
    id              BIGSERIAL PRIMARY KEY,
    report_id       BIGINT      NOT NULL REFERENCES reports(id),
    student_id      BIGINT      NOT NULL REFERENCES students(id),
    intent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- 13. 后台操作日志（审计） ----------
CREATE TABLE admin_logs (
    id              BIGSERIAL PRIMARY KEY,
    actor           VARCHAR(32) NOT NULL,
    action          VARCHAR(32) NOT NULL,                 -- import_questions/publish_report/...
    payload         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 设计说明（读我）：
-- 1. answer_records 是分析主表：CTT实测P/D按question_id聚合；错因分布按ec_final聚合；
--    行为分析按behavior_tag/time_spent_ms聚合。导出CSV即本表全字段。
-- 2. answer_events 是原始证据：behavior.ts从此表汇总生成answer_records的行为字段，
--    汇总后原始事件不删（分析师争议复核时回放用）。
-- 3. 常模百分位、干预包、错题本等二期表不在本DDL中，升级时另发V2迁移脚本。
-- ============================================================================
