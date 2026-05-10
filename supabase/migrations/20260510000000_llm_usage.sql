-- =============================================================
-- Daily LLM call ledger — circuit breaker for Gemini / Groq spend
-- =============================================================
-- Single-row-per-day counter. Server actions bump the relevant column
-- after every successful generateContent call; the assert helper reads
-- the row first and refuses new calls once the daily cap is hit.
-- Uses service-role key in production so RLS is enabled but no policies
-- are exposed to the anon role.
CREATE TABLE IF NOT EXISTS llm_usage_daily (
  day DATE PRIMARY KEY,
  gemini_calls INTEGER NOT NULL DEFAULT 0,
  groq_calls INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE llm_usage_daily ENABLE ROW LEVEL SECURITY;

-- Atomic increment helper — avoids read-modify-write races between concurrent analyses.
CREATE OR REPLACE FUNCTION increment_llm_usage(
  p_provider TEXT,
  p_day DATE DEFAULT (NOW() AT TIME ZONE 'UTC')::DATE
) RETURNS llm_usage_daily LANGUAGE plpgsql AS $$
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
