"use server"

import { createServerClient } from "@/lib/supabase/server"
import { labelForDocumentDateType } from "@/lib/document-dates/date-type-label"
import {
  addUtcDays,
  calendarTodayIsoInTimeZone,
  firstShowDate,
  isInNotificationWindow,
  lastShowDate,
} from "@/lib/notifications/reminder-window"
import { ruleAppliesToDateType } from "@/lib/notifications/supported-date-types"

const GRACE_DAYS_AFTER_DEADLINE = 14

/** Civil "today" for window checks (must match how date_on is interpreted). Override via env if needed. */
const NOTIFICATION_CALENDAR_TIMEZONE =
  process.env.APP_CALENDAR_TIMEZONE?.trim() || "Europe/Brussels"

/** Only sync dates in this horizon to limit rows (prototype). */
const PAST_LOOKBACK_DAYS = 120
const FUTURE_LOOKAHEAD_DAYS = 730

/** PostgREST default max-rows is often 1000; paginate so no in-window row is skipped. */
const DOCUMENT_DATES_PAGE_SIZE = 1000

function syncDebugEnabled(): boolean {
  return process.env.DEBUG_NOTIFICATION_SYNC === "1"
}

function syncDebugDocId(): string | undefined {
  const v = process.env.DEBUG_NOTIFICATION_SYNC_DOC_ID?.trim()
  return v || undefined
}

function syncLog(message: string, extra?: Record<string, unknown>) {
  if (!syncDebugEnabled()) return
  if (extra) console.log(`[syncNotifications] ${message}`, extra)
  else console.log(`[syncNotifications] ${message}`)
}

type RuleRow = {
  id: string
  offset_days_before: number
  label: string
  date_types: string[] | null
  enabled: boolean
}

type DateRow = {
  id: string
  property_id: string
  document_id: string
  date_type: string
  date_on: string
  properties?: { user_id?: string; display_name?: string | null } | { user_id?: string; display_name?: string | null }[] | null
}

function pickProperty(
  p: DateRow["properties"]
): { user_id: string; display_name: string | null } | null {
  if (!p) return null
  const one = Array.isArray(p) ? p[0] : p
  if (!one?.user_id) return null
  return { user_id: one.user_id, display_name: one.display_name ?? null }
}

/**
 * Idempotent: creates missing notifications for (document_date, rule) pairs in window.
 * Call from dashboard load — no background job.
 */
export async function syncNotificationsFromDocumentDates(): Promise<{
  inserted: number
  error: string | null
}> {
  try {
    const supabase = createServerClient()
    const today = calendarTodayIsoInTimeZone(NOTIFICATION_CALENDAR_TIMEZONE)
    const windowStart = addUtcDays(today, -PAST_LOOKBACK_DAYS)
    const windowEnd = addUtcDays(today, FUTURE_LOOKAHEAD_DAYS)

    const { data: rulesData, error: rulesError } = await supabase
      .from("notification_rules")
      .select("id, offset_days_before, label, date_types, enabled")
      .eq("enabled", true)
      .order("sort_order", { ascending: true })

    if (rulesError) {
      return { inserted: 0, error: rulesError.message }
    }

    const rules = (rulesData as RuleRow[]) || []
    if (rules.length === 0) {
      return { inserted: 0, error: null }
    }

    const datesSelect = `
        id,
        property_id,
        document_id,
        date_type,
        date_on,
        properties ( user_id, display_name )
      `

    const dates: DateRow[] = []
    for (let from = 0; ; from += DOCUMENT_DATES_PAGE_SIZE) {
      const to = from + DOCUMENT_DATES_PAGE_SIZE - 1
      const { data: page, error: datesError } = await supabase
        .from("document_dates")
        .select(datesSelect)
        .gte("date_on", windowStart)
        .lte("date_on", windowEnd)
        .order("date_on", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)

      if (datesError) {
        return { inserted: 0, error: datesError.message }
      }

      const chunk = (page as DateRow[]) || []
      dates.push(...chunk)
      if (chunk.length < DOCUMENT_DATES_PAGE_SIZE) break
    }

    const dbgId = syncDebugDocId()
    const traceId = syncDebugEnabled() ? dbgId : undefined

    if (syncDebugEnabled()) {
      syncLog("window", {
        today,
        tz: NOTIFICATION_CALENDAR_TIMEZONE,
        windowStart,
        windowEnd,
        rulesCount: rules.length,
        documentDatesLoaded: dates.length,
      })
      if (dbgId) {
        const inBatch = dates.some((d) => d.id === dbgId)
        syncLog(`doc_date ${dbgId} in loaded batch`, { inBatch })
        const { data: direct, error: directErr } = await supabase
          .from("document_dates")
          .select(datesSelect)
          .eq("id", dbgId)
          .maybeSingle()
        syncLog(`doc_date ${dbgId} direct fetch`, {
          found: !!direct,
          error: directErr?.message ?? null,
          row: direct ?? null,
        })
      }
    }
    const candidates: Array<{
      user_id: string
      property_id: string
      document_id: string
      document_date_id: string
      rule_id: string
      title: string
      body: string
    }> = []

    for (const dd of dates) {
      const prop = pickProperty(dd.properties)
      const traceThis = !!traceId && dd.id === traceId
      if (traceThis) {
        syncLog("trace row: property embed", {
          document_date_id: dd.id,
          hasProperties: dd.properties != null,
          pickProperty: prop,
        })
      }
      if (!prop) continue

      const deadline = dd.date_on.slice(0, 10)

      for (const rule of rules) {
        const applies = ruleAppliesToDateType(rule.date_types, dd.date_type)
        const inWin = isInNotificationWindow(
          today,
          deadline,
          rule.offset_days_before,
          GRACE_DAYS_AFTER_DEADLINE
        )
        if (traceThis) {
          syncLog("trace row: rule", {
            rule_id: rule.id,
            offset_days_before: rule.offset_days_before,
            date_types: rule.date_types,
            date_type: dd.date_type,
            deadline,
            ruleAppliesToDateType: applies,
            firstShow: firstShowDate(deadline, rule.offset_days_before),
            lastShow: lastShowDate(deadline, GRACE_DAYS_AFTER_DEADLINE),
            isInNotificationWindow: inWin,
          })
        }
        if (!applies) continue
        if (!inWin) continue

        const humanLabel = labelForDocumentDateType(dd.date_type)
        const propName =
          prop.display_name?.trim() || `Pand ${dd.property_id.slice(0, 8)}…`

        const title = `Herinnering: ${humanLabel}`
        const body = `${propName} — ${humanLabel} op ${deadline} (${rule.label}).`

        candidates.push({
          user_id: prop.user_id,
          property_id: dd.property_id,
          document_id: dd.document_id,
          document_date_id: dd.id,
          rule_id: rule.id,
          title,
          body,
        })
      }
    }

    if (candidates.length === 0) {
      return { inserted: 0, error: null }
    }

    const ids = [...new Set(candidates.map((c) => c.document_date_id))]
    const { data: existing, error: exErr } = await supabase
      .from("notifications")
      .select("document_date_id, rule_id")
      .in("document_date_id", ids)

    if (exErr) {
      return { inserted: 0, error: exErr.message }
    }

    const existingSet = new Set(
      (existing as { document_date_id: string; rule_id: string }[]).map(
        (e) => `${e.document_date_id}|${e.rule_id}`
      )
    )

    const toInsert = candidates.filter(
      (c) => !existingSet.has(`${c.document_date_id}|${c.rule_id}`)
    )

    if (syncDebugEnabled() && traceId) {
      const forTrace = (c: (typeof candidates)[0]) => c.document_date_id === traceId
      syncLog("trace row: after dedupe", {
        candidateRowsForDoc: candidates.filter(forTrace),
        existingPairsForDoc: (existing as { document_date_id: string; rule_id: string }[])
          .filter((e) => e.document_date_id === traceId),
        toInsertRowsForDoc: toInsert.filter(forTrace),
      })
    }

    if (toInsert.length === 0) {
      return { inserted: 0, error: null }
    }

    const upsertPayload = toInsert.map((c) => ({
      user_id: c.user_id,
      property_id: c.property_id,
      document_id: c.document_id,
      document_date_id: c.document_date_id,
      rule_id: c.rule_id,
      title: c.title,
      body: c.body,
    }))

    // upsert + ignoreDuplicates: idempotent under concurrent loads; never updates existing rows
    const { error: insErr } = await supabase
      .from("notifications")
      .upsert(upsertPayload, {
        onConflict: "document_date_id,rule_id",
        ignoreDuplicates: true,
      })

    if (syncDebugEnabled() && traceId) {
      syncLog("trace row: upsert", {
        insErr: insErr?.message ?? null,
        payloadsForDoc: upsertPayload.filter((p) => p.document_date_id === traceId),
      })
    }

    if (insErr) {
      return { inserted: 0, error: insErr.message }
    }

    return { inserted: toInsert.length, error: null }
  } catch (e) {
    return {
      inserted: 0,
      error: e instanceof Error ? e.message : "sync failed",
    }
  }
}
