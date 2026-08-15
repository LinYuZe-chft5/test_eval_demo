-- ============================================================================
-- 🧹 数据库清理脚本（修正版 - 无变量名冲突）
-- ============================================================================

DO $$ 
DECLARE
    tbl text;  -- 使用 tbl 作为变量名，避免与SQL列名冲突
BEGIN
    FOR tbl IN 
        SELECT unnest(ARRAY[
            'report_feedback',
            'report_inquiries', 
            'report_drafts',
            'answer_events',
            'answer_records',
            'test_sessions',
            'students',
            'access_codes',
            'questions',
            'blueprints',
            'kp_dependencies',
            'method_cards'
        ])
    LOOP
        IF EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = tbl
        ) THEN
            RAISE NOTICE '📋 清理表: %', tbl;
            EXECUTE format('DELETE FROM %I WHERE 1=1', tbl);
            RAISE NOTICE '  ✅ 已清空: %', tbl;
        ELSE
            RAISE NOTICE '⏭️ 跳过不存在的表: %', tbl;
        END IF;
    END LOOP;
END $$;

-- ✅ 验证
SELECT 
    (SELECT COUNT(*) FROM questions) as questions_left,
    (SELECT COUNT(*) FROM answer_records) as records_left,
    (SELECT COUNT(*) FROM students) as students_left,
    '✅ 清理完成' as result;
