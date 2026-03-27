import Link from "next/link"
import { CalendarClock } from "lucide-react"
import type { UpcomingDeadlineRow } from "@/app/actions/get-upcoming-deadlines"
import { urgencyBadgeClass, urgencyForDocumentDate } from "@/lib/calendar-urgency"

type Props = {
  rows: UpcomingDeadlineRow[]
  error: string | null
}

function propertyLabel(r: UpcomingDeadlineRow): string {
  return r.propertyDisplayName?.trim() || `Pand ${r.property_id.slice(0, 8)}…`
}

export function UpcomingDeadlines({ rows, error }: Props) {
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
        <ul className="space-y-2 rounded-xl bg-dashboard-surface-low p-1.5">
          {rows.map((r) => {
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
                      {r.documentTypeName ? ` · ${r.documentTypeName}` : ""}
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
      )}
    </div>
  )
}
