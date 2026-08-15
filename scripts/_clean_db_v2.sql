-- ============================================================================
-- 🧹 数据库完整清理脚本（按外键依赖顺序删除）
-- 目标：清除所有旧数据，准备重新导入S3/S6修复后的种子数据
-- 使用场景：在Supabase SQL Editor中执行
-- ============================================================================

-- 第1步：清除所有学生的反馈和行为记录（最外层依赖）
DELETE FROM report_feedback WHERE 1=1;
DELETE FROM report_inquiries WHERE 1=1;

-- 第2步：清除所有诊断报告（依赖学生）
DELETE FROM report_drafts WHERE 1=1;

-- 第3步：清除原始行为事件（依赖题目和会话）
DELETE FROM answer_events WHERE 1=1;

-- 第4步：清除探测题的反向引用
UPDATE answer_records SET probe_for = NULL WHERE probe_for IS NOT NULL;

-- 第5步：清除所有作答记录（依赖题目和会话）
DELETE FROM answer_records WHERE 1=1;

-- 第6步：清除所有诊断会话
DELETE FROM test_sessions WHERE 1=1;

-- 第7步：清除所有学生档案（依赖访问码）
DELETE FROM students WHERE 1=1;

-- 第8步：清除所有访问码
DELETE FROM access_codes WHERE 1=1;

-- 第9步：清除题库（最后删除，因为是最外层依赖）
-- 先断开自引用（variant_of）
UPDATE questions SET variant_of = NULL WHERE variant_of IS NOT NULL;
DELETE FROM questions WHERE 1=1;

-- 第10步：清除蓝皮书（题库的元数据）
DELETE FROM blueprints WHERE 1=1;

-- 第11步：清除知识点依赖和方法卡
DELETE FROM kp_dependencies WHERE 1=1;
DELETE FROM method_cards WHERE 1=1;

-- ✅ 清理完成验证
SELECT '✅ 数据库已完全清空，可重新导入种子数据' as status;
SELECT COUNT(*) as remaining_records FROM questions;

-- ============================================================================
-- ⚠️ 如果只想清除特定SKU的题目（保留其他数据），使用以下版本：
-- ============================================================================

/*
-- 版本B：只清除S3/S6的题目及相关数据
-- 先清除这些题目的作答记录
DELETE FROM answer_events WHERE question_id IN (
    SELECT id FROM questions WHERE sku_code IN ('S3-01', 'S6-01')
);

DELETE FROM answer_records WHERE question_id IN (
    SELECT id FROM questions WHERE sku_code IN ('S3-01', 'S6-01')
);

-- 清除题目
DELETE FROM questions WHERE sku_code IN ('S3-01', 'S6-01');

SELECT '✅ S3/S6题目已清除' as status;
SELECT COUNT(*) as s3_count FROM questions WHERE sku_code = 'S3-01';
SELECT COUNT(*) as s6_count FROM questions WHERE sku_code = 'S6-01';
*/
