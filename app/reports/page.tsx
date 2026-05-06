import type { Metadata } from "next"
import Link from "next/link"
import { Building2, FileText } from "lucide-react"

export const metadata: Metadata = {
  title: "Rapporten",
  description: "Interne notities en rapporten per pand.",
}
import { getDashboardNotifications } from "@/app/actions/get-dashboard-notifications"
import { getReportsData } from "@/app/actions/reports"
import { CreateReportForm } from "@/components/reports/CreateReportForm"
import { AppShell } from "@/components/AppShell"
import { formatDateTimeNl } from "@/lib/date-formatting"

export const dynamic = "force-dynamic"

export default async function ReportsPage() {
  const [{ reports, properties, error }, { data: notificationRows, error: notificationsError }] =
    await Promise.all([getReportsData(), getDashboardNotifications(12)])

  return (
    <AppShell
      notifications={notificationRows}
      notificationsError={notificationsError}
    >
      <div className="dashboard-content space-y-8">
            <section className="space-y-2">
              <h1 className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-tight text-dashboard-primary">
                <FileText className="h-7 w-7" />
                Rapporten
              </h1>
              <p className="text-sm text-dashboard-on-surface-variant">
                Interne notities gekoppeld aan panden.
              </p>
            </section>

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                Rapporten konden niet geladen worden: {error}
              </div>
            ) : null}

            <section className="grid grid-cols-1 gap-8 xl:grid-cols-3">
              <div className="xl:col-span-1">
                <CreateReportForm properties={properties} />
              </div>
              <div className="xl:col-span-2 space-y-4">
                {reports.length === 0 ? (
                  <div className="rounded-xl border border-dashboard-outline-variant/20 bg-white p-6 text-sm text-dashboard-on-surface-variant shadow-sm">
                    Nog geen rapporten. Maak uw eerste interne notitie aan.
                  </div>
                ) : (
                  reports.map((report) => (
                    <article key={report.id} className="rounded-xl border border-dashboard-outline-variant/20 bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-bold text-dashboard-on-surface">{report.title}</h2>
                          <p className="mt-1 inline-flex items-center gap-1 text-xs text-dashboard-on-surface-variant">
                            <Building2 className="h-3.5 w-3.5" />
                            {report.property_display_name?.trim() || `Property ${report.property_id.slice(0, 8)}`}
                          </p>
                        </div>
                        <div className="text-right text-xs text-dashboard-on-surface-variant">
                          <p>Aangemaakt: {formatDateTimeNl(report.created_at)}</p>
                          <p>Bijgewerkt: {formatDateTimeNl(report.updated_at)}</p>
                        </div>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-dashboard-on-surface">
                        {report.note_text}
                      </p>
                      <p className="mt-3 text-xs text-dashboard-on-surface-variant">
                        Auteur: {report.author_name?.trim() || "Onbekend"}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>
      </div>
    </AppShell>
  )
}



