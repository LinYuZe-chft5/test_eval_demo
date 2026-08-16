-- ============================================================
-- 在 Supabase SQL Editor 执行此脚本
-- 创建批量导入题库的 RPC 函数
-- ============================================================

CREATE OR REPLACE FUNCTION public.batch_upsert_questions(
  questions_data JSONB,
  p_sku_code TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows JSONB;
  v_sku TEXT;
  v_day SMALLINT;
  v_seq SMALLINT;
  v_item JSONB;
  v_count INT := 0;
BEGIN
  -- 遍历每个题目
  FOR v_item IN
    SELECT jsonb_array_elements(questions_data) AS item
  LOOP
    -- 提取关键字段
    v_sku := COALESCE(v_item->>'sku_code', p_sku, 'UNKNOWN');
    v_day := COALESCE((v_item->>'day_tag')::SMALLINT, 1);
    v_seq := COALESCE((v_item->>'seq_no')::SMALLINT, 1);

    -- UPSERT：插入或更新
    INSERT INTO questions (
      sku_code, subject, day_tag, seq_no, q_type,
      is_warmup, is_anchor,
      stem, image_url, options, steps, correct_answer, answer_spec, score, solution,
      kp_code, kp_related, cognitive_level, literacy_codes, ec_mapping,
      difficulty_est, expected_time_sec,
      improvement_tip, variant_stem, variant_answer,
      status, exposure_count, stem_hash, version
    )
    VALUES (
      v_sku,
      COALESCE(v_item->>'subject', 'math'),
      v_day,
      v_seq,
      COALESCE(v_item->>'q_type', 'choice'),
      COALESCE((v_item->>'is_warmup')::BOOLEAN, FALSE),
      COALESCE((v_item->>'is_anchor')::BOOLEAN, FALSE),
      COALESCE(v_item->>'stem', ''),
      v_item->>'image_url',
      v_item->'options',
      v_item->'steps',
      v_item->>'correct_answer',
      v_item->'answer_spec',
      COALESCE((v_item->>'score')::NUMERIC, 1),
      COALESCE(v_item->>'solution', ''),
      COALESCE(v_item->>'kp_code', 'KP-unknown'),
      v_item->>'kp_related',
      COALESCE(v_item->>'cognitive_level', 'L2'),
      COALESCE(v_item->'literacy_codes', ARRAY['S1']::VARCHAR(32)[]),
      COALESCE(v_item->'ec_mapping', ARRAY[]::VARCHAR(8)[]),
      COALESCE((v_item->>'difficulty_est')::NUMERIC, 0.5),
      COALESCE((v_item->>'expected_time_sec')::INT, 300),
      v_item->>'improvement_tip',
      v_item->>'variant_stem',
      v_item->>'variant_answer',
      'active',
      0,
      COALESCE(v_item->>'stem_hash', ''),
      COALESCE(v_item->>'version', 'v1.0')
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
      updated_at = NOW();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
