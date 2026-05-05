"use client"

import { useState } from "react"
import Link from "next/link"
import { CalendarClock, ChevronDown, ChevronUp } from "lucide-react"
import type { UpcomingDeadlineRow } from "@/app/actions/get-upcoming-deadlines"
import { urgencyBadgeClass, urgencyForDocumentDate } from "@/lib/calendar-urgency"

const VISIBLE_LIMIT = 5

type Props = {
  rows: UpcomingDeadlineRow[]
  error: string | null
}

function propertyLabel(r: UpcomingDeadlineRow): string {
  return r.propertyDisplayName?.trim() || `Pand ${r.property_id.slice(0, 8)}â€¦`
}

export function UpcomingDeadlines({ rows, error }: Props) {
  const [expanded, setExpanded] = useState(false)

  const hasMore = rows.length > VISIBLE_LIMIT
  const visible = expanded ? rows : rows.slice(0, VISIBLE_LIMIT)
  const hiddenCount = rows.length - VISIBLE_LIMIT

  return (
    <div className="space-y-4">
      <h2 className="dashboard-section-title">
        <CalendarClock className="h-5 w-5" aria-hidden />
        Upcoming Deadlines
      </h2>
      {error && (
        <div
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          Deadlines konden niet geladen worden: {error}
        </div>
      )}

      {!error && rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dashboard-outline-variant/40 bg-dashboard-surface px-6 py-12 text-center text-sm text-dashboard-on-surface-variant">
          Geen aankomende datums. Voer documentanalyses uit om datums te vullen.
        </div>
      ) : (
        <div className="rounded-xl bg-dashboard-surface-low p-1.5">
          <ul className="space-y-2">
            {visible.map((r) => {
              const u = urgencyForDocumentDate(r.date_type, r.date_on)
              return (
                <li key={r.id}>
                  <Link
                    href={`/properties/${r.property_id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-dashboard-outline-variant/20 bg-dashboard-surface p-4 text-sm transition-all hover:shadow-md"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-bold text-dashboard-on-surface">{r.labelDisplay}</p>
                      <p className="text-xs text-dashboard-on-surface-variant">{propertyLabel(r)}</p>
                      <p className="text-xs text-dashboard-on-surface-variant">
                        {r.labelDisplay}
                        {r.documentTypeName ? ` Â· ${r.documentTypeName}` : ""}
                      </p>
                    </div>
                    <span className="text-right">
                      <span className={`saas-badge ${urgencyBadgeClass(u)}`}>{r.date_on}</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold text-dashboard-on-surface-variant transition-colors hover:bg-dashboard-surface hover:text-dashboard-primary"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  Minder tonen
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  {hiddenCount} meer tonen
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
