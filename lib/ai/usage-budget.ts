import "server-only"

import { createServerClient } from "@/lib/supabase/server"

export type LlmProvider = "gemini" | "groq"

export class BudgetExceededError extends Error {
  readonly userMessage: string
  readonly provider: LlmProvider
  readonly used: number
  readonly cap: number

  constructor(provider: LlmProvider, used: number, cap: number) {
    super(`Daily ${provider} call cap reached (${used}/${cap})`)
    this.name = "BudgetExceededError"
    this.provider = provider
    this.used = used
    this.cap = cap
    this.userMessage =
      "Dagelijkse AI-limiet bereikt. Probeer het morgen opnieuw of verhoog de limiet via LLM_MAX_CALLS_PER_DAY."
  }
}

const DEFAULT_DAILY_CAP = 200

function dailyCap(): number {
  const raw = process.env.LLM_MAX_CALLS_PER_DAY?.trim()
  if (!raw) return DEFAULT_DAILY_CAP
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAILY_CAP
  return n
}

export function getDailyLlmCallCap(): number {
  return dailyCap()
}

function todayUtcIso(): string {
  // Use UTC so the same key matches what the SQL function defaults to.
  return new Date().toISOString().slice(0, 10)
}

type UsageRow = {
  day: string
  gemini_calls: number
  groq_calls: number
}

async function readTodayRow(): Promise<UsageRow | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from("llm_usage_daily")
    .select("day, gemini_calls, groq_calls")
    .eq("day", todayUtcIso())
    .maybeSingle()

  if (error) {
    console.warn("[llm-budget] read failed (treated as zero usage):", error.message)
    return null
  }
  return (data as UsageRow | null) ?? null
}

export async function getTodayLlmUsageSnapshot(): Promise<{
  day: string
  cap: number
  geminiCalls: number
  groqCalls: number
}> {
  const row = await readTodayRow()
  return {
    day: todayUtcIso(),
    cap: dailyCap(),
    geminiCalls: row?.gemini_calls ?? 0,
    groqCalls: row?.groq_calls ?? 0,
  }
}

/**
 * Throws `BudgetExceededError` when today's accumulated calls for the given provider already meet
 * or exceed the daily cap. Best-effort: a transient read failure logs a warning but allows the call,
 * so a Supabase blip never blocks the realtor entirely.
 */
export async function assertWithinDailyBudget(provider: LlmProvider): Promise<void> {
  const cap = dailyCap()
  const row = await readTodayRow()
  if (!row) return
  const used = provider === "gemini" ? row.gemini_calls : row.groq_calls
  if (used >= cap) {
    throw new BudgetExceededError(provider, used, cap)
  }
}

/**
 * Best-effort post-call increment. Failures are logged but never thrown — losing one tick of
 * accounting is preferable to surfacing a DB error after the AI work succeeded.
 */
export async function recordLlmCall(provider: LlmProvider): Promise<void> {
  try {
    const supabase = createServerClient()
    const { error } = await supabase.rpc("increment_llm_usage", { p_provider: provider })
    if (error) {
      console.warn(`[llm-budget] increment failed for ${provider}:`, error.message)
    }
  } catch (e) {
    console.warn(`[llm-budget] increment threw for ${provider}:`, e)
  }
}
