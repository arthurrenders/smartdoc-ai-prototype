-- Lock the function's search_path so it can't be hijacked by a search_path manipulation attack.
-- Addresses the `function_search_path_mutable` advisor (WARN) on increment_llm_usage.
CREATE OR REPLACE FUNCTION increment_llm_usage(
  p_provider TEXT,
  p_day DATE DEFAULT (NOW() AT TIME ZONE 'UTC')::DATE
) RETURNS llm_usage_daily LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  result llm_usage_daily;
BEGIN
  IF p_provider NOT IN ('gemini', 'groq') THEN
    RAISE EXCEPTION 'Unknown provider: %', p_provider;
  END IF;

  INSERT INTO llm_usage_daily (day, gemini_calls, groq_calls)
  VALUES (
    p_day,
    CASE WHEN p_provider = 'gemini' THEN 1 ELSE 0 END,
    CASE WHEN p_provider = 'groq' THEN 1 ELSE 0 END
  )
  ON CONFLICT (day) DO UPDATE SET
    gemini_calls = llm_usage_daily.gemini_calls + (CASE WHEN p_provider = 'gemini' THEN 1 ELSE 0 END),
    groq_calls = llm_usage_daily.groq_calls + (CASE WHEN p_provider = 'groq' THEN 1 ELSE 0 END),
    updated_at = NOW()
  RETURNING * INTO result;

  RETURN result;
END;
$$;
