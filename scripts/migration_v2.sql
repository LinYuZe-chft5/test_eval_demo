-- ============================================================================
-- V2 进阶迁移脚本 — 多身份多题库支持
-- 执行位置：Supabase SQL Editor
-- 说明：在 MVP DDL 基础上 ALTER TABLE，不新建表
-- ============================================================================

-- 1. 扩展 access_codes.code 字段长度（8→32，支持用户自定义访问码）
ALTER TABLE access_codes ALTER COLUMN code TYPE VARCHAR(32);

-- 2. 新增 identity 字段（身份选择：初一/初二/初三）
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS identity VARCHAR(16);

-- 3. 新增 nickname 字段（用户自定义昵称）
ALTER TABLE access_codes ADD COLUMN IF NOT EXISTS nickname VARCHAR(32);

-- 4. 验证迁移结果
SELECT 'access_codes' as table_name,
       column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'access_codes'
ORDER BY ordinal_position;
