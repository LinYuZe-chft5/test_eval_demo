-- ============================================================================
-- 🧹 数据库清理脚本（按外键依赖顺序 - 手动执行版）
-- 
-- ⚠️ 重要：必须按顺序从上到下逐步执行，每一步单独执行
--    如果某步报错说表不存在，直接跳过执行下一步
-- ============================================================================

-- 【第1步】最外层子表（依赖reports和students）
-- 如果表不存在就跳过
DELETE FROM report_feedback WHERE 1=1;
DELETE FROM retest_intents WHERE 1=1;

-- 【第2步】诊断报告（依赖students）
DELETE FROM reports WHERE 1=1;
DELETE FROM report_drafts WHERE 1=1;

-- 【第3步】行为事件（依赖test_sessions和questions）
DELETE FROM answer_events WHERE 1=1;

-- 【第4步】作答记录（依赖test_sessions, students, questions）
DELETE FROM answer_records WHERE 1=1;

-- 【第5步】诊断会话（依赖students）
DELETE FROM test_sessions WHERE 1=1;

-- 【第6步】学生档案（依赖access_codes）
DELETE FROM students WHERE 1=1;

-- 【第7步】访问码
DELETE FROM access_codes WHERE 1=1;

-- 【第8步】题库（最后删除，所有表都依赖它）
-- 先断开自引用
UPDATE questions SET variant_of = NULL WHERE variant_of IS NOT NULL;
DELETE FROM questions WHERE 1=1;

-- 【第9步】元数据表
DELETE FROM blueprints WHERE 1=1;
DELETE FROM kp_dependencies WHERE 1=1;
DELETE FROM method_cards WHERE 1=1;
DELETE FROM admin_logs WHERE 1=1;

-- ✅ 最终验证
SELECT 
    (SELECT COUNT(*) FROM questions) as questions_count,
    (SELECT COUNT(*) FROM students) as students_count,
    (SELECT COUNT(*) FROM access_codes) as codes_count,
    (SELECT COUNT(*) FROM answer_records) as records_count,
    (SELECT COUNT(*) FROM reports) as reports_count,
    '✅ 清理完成' as status;
