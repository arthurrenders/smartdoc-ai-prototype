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
    <div className="saas-card">
      <h2 className="saas-section-heading inline-flex items-center gap-2 text-xl sm:text-2xl">
        <CalendarClock className="h-5 w-5 text-brand-dark dark:text-brand-light" aria-hidden />
        Aankomende deadlines
      </h2>
      <p className="saas-section-subheading mb-8">
        Gebaseerd op opgeslagen datums in documenten (vanaf vandaag).
      </p>

      {error && (
        <div
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          Deadlines konden niet geladen worden: {error}
        </div>
      )}

      {!error && rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-white/80 px-6 py-12 text-center text-sm text-muted-foreground dark:bg-card/50">
          Geen aankomende datums. Voer documentanalyses uit om datums te vullen.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const u = urgencyForDocumentDate(r.date_type, r.date_on)
            return (
              <li key={r.id}>
                <Link
                  href={`/properties/${r.property_id}`}
                  className="flex flex-col gap-2 rounded-xl border border-[hsl(var(--border))] bg-white p-4 text-sm shadow-sm transition-all duration-200 hover:border-brand-light/55 hover:shadow-md sm:flex-row sm:items-center sm:justify-between dark:bg-card"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-base font-semibold tabular-nums text-foreground">{r.date_on}</p>
                    <p className="font-medium text-foreground">{propertyLabel(r)}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.labelDisplay}
                      {r.documentTypeName ? ` · ${r.documentTypeName}` : ""}
                    </p>
                  </div>
                  <span className={`saas-badge mt-1 shrink-0 self-start sm:mt-0 ${urgencyBadgeClass(u)}`}>
                    {r.labelDisplay}
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
