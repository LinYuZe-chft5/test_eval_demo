-- ============================================================
-- 在 Supabase SQL Editor 执行此脚本
-- 创建批量导入题库的 RPC 函数
-- 支持 UPSERT：冲突时自动更新
-- ============================================================

CREATE OR REPLACE FUNCTION public.batch_upsert_questions(
  questions_data JSONB,
  sku_code TEXT DEFAULT NULL
)
RETURNS TABLE(
  inserted_count INT,
  updated_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted INT := 0;
  v_updated INT := 0;
  v_question JSONB;
  v_id BIGINT;
BEGIN
  -- 创建临时表
  CREATE TEMP TABLE IF NOT EXISTS tmp_questions (
    id BIGSERIAL,
    data JSONB NOT NULL
  ) ON COMMIT DROP;

  -- 插入数据到临时表
  INSERT INTO tmp_questions (data)
  SELECT jsonb_array_elements(questions_data);

  -- 逐行 UPSERT
  FOR v_question IN
    SELECT data FROM tmp_questions ORDER BY id
  LOOP
    -- UPSERT：冲突时更新
    INSERT INTO questions (
      sku_code, subject, day_tag, seq_no, q_type,
      is_warmup, is_anchor,
      stem, image_url, options, steps, correct_answer, answer_spec, score, solution,
      kp_code, kp_related, cognitive_level, literacy_codes, ec_mapping,
      difficulty_est, discrimination_est, expected_time_sec,
      pairing_id, parallel_group_id, variant_of,
      improvement_tip, variant_stem, variant_answer,
      status, exposure_count, measured_p, measured_d,
      stem_hash, version, reviewer
    )
    VALUES (
      COALESCE(v_question->>'sku_code', sku_code),
      COALESCE(v_question->>'subject', 'math'),
      COALESCE((v_question->>'day_tag')::SMALLINT, 1),
      COALESCE((v_question->>'seq_no')::SMALLINT, 1),
      COALESCE(v_question->>'q_type', 'choice'),
      COALESCE((v_question->>'is_warmup')::BOOLEAN, FALSE),
      COALESCE((v_question->>'is_anchor')::BOOLEAN, FALSE),
      COALESCE(v_question->>'stem', ''),
      v_question->>'image_url',
      v_question->'options',
      v_question->'steps',
      v_question->>'correct_answer',
      v_question->'answer_spec',
      COALESCE((v_question->>'score')::NUMERIC, 1),
      COALESCE(v_question->>'solution', v_question->>'stem', ''),
      COALESCE(v_question->>'kp_code', 'KP-unknown'),
      v_question->>'kp_related',
      COALESCE(v_question->>'cognitive_level', 'L2'),
      COALESCE(v_question->'literacy_codes', ARRAY['S1']::VARCHAR(32)[]),
      COALESCE(v_question->'ec_mapping', ARRAY[]::VARCHAR(8)[]),
      COALESCE((v_question->>'difficulty_est')::NUMERIC, 0.5),
      (v_question->>'discrimination_est')::NUMERIC,
      COALESCE((v_question->>'expected_time_sec')::INT, 300),
      v_question->>'pairing_id',
      v_question->>'parallel_group_id',
      NULL::BIGINT,
      v_question->>'improvement_tip',
      v_question->>'variant_stem',
      v_question->>'variant_answer',
      'active',
      0,
      (v_question->>'measured_p')::NUMERIC,
      (v_question->>'measured_d')::NUMERIC,
      COALESCE(v_question->>'stem_hash', ''),
      COALESCE(v_question->>'version', 'v1.0'),
      v_question->>'reviewer'
    )
    ON CONFLICT (sku_code, day_tag, seq_no)
    DO UPDATE SET
      stem = EXCLUDED.stem,
      options = EXCLUDED.options,
      steps = EXCLUDED.steps,
      correct_answer = EXCLUDED.correct_answer,
      answer_spec = EXCLUDED.answer_spec,
      score = EXCLUDED.score,
      solution = EXCLUDED.solution,
      kp_code = EXCLUDED.kp_code,
      kp_related = EXCLUDED.kp_related,
      cognitive_level = EXCLUDED.cognitive_level,
      literacy_codes = EXCLUDED.literacy_codes,
      ec_mapping = EXCLUDED.ec_mapping,
      difficulty_est = EXCLUDED.difficulty_est,
      expected_time_sec = EXCLUDED.expected_time_sec,
      improvement_tip = EXCLUDED.improvement_tip,
      variant_stem = EXCLUDED.variant_stem,
      variant_answer = EXCLUDED.variant_answer,
      stem_hash = EXCLUDED.stem_hash,
      version = EXCLUDED.version,
      updated_at = NOW()
    RETURNING id INTO v_id;

    IF v_id IS NOT NULL THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- 返回结果
  inserted_count := v_inserted;
  updated_count := v_updated;
  RETURN;

  -- 清理
  DROP TABLE IF EXISTS tmp_questions;
END;
$$;

-- 授予执行权限给匿名角色（如果需要公开访问）
-- GRANT EXECUTE ON FUNCTION public.batch_upsert_questions(JSONB, TEXT) TO anon;
-- GRANT EXECUTE ON FUNCTION public.batch_upsert_questions(JSONB, TEXT) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.batch_upsert_questions(JSONB, TEXT) TO service_role;
