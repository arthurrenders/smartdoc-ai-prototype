import Link from "next/link"
import Image from "next/image"
import { Building2, FileText, LayoutDashboard, Map as MapIcon, Plus, Search, Settings } from "lucide-react"
import { getDashboardNotifications } from "@/app/actions/get-dashboard-notifications"
import { getReportsData } from "@/app/actions/reports"
import { NotificationsBellDropdown } from "@/components/navigation/NotificationsBellDropdown"
import { ExportDataButton } from "@/components/navigation/ExportDataButton"
import { CreateReportForm } from "@/components/reports/CreateReportForm"
import logoImage from "@/components/public/logo png.png"

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString()
}

export default async function ReportsPage() {
  const [{ reports, properties, error }, { data: notificationRows, error: notificationsError }] =
    await Promise.all([getReportsData(), getDashboardNotifications(12)])

  return (
    <div className="-mt-10 sm:-mt-12 lg:-mt-16">
      <div className="dashboard-shell">
        <aside className="dashboard-sidenav">
          <div className="p-6">
            <div className="mb-6 px-4">
              <Image
                src={logoImage}
                alt="SmartDoc AI logo"
                width={528}
                height={132}
                className="h-24 w-auto max-w-full object-contain"
                priority
              />
            </div>
            <Link
              href="/properties/new"
              className="mb-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-dashboard-primary px-4 py-3 text-sm font-bold text-white transition-all hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New Property
            </Link>
            <nav className="space-y-1">
              <Link
                href="/"
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-dashboard-primary"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link
                href="/map"
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-dashboard-primary"
              >
                <MapIcon className="h-4 w-4" />
                Map View
              </Link>
            </nav>
          </div>
          <div className="mt-auto border-t border-dashboard-outline-variant/40 p-6">
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:text-dashboard-primary"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="dashboard-topnav">
            <div className="flex items-center gap-8">
              <div className="relative hidden w-64 lg:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dashboard-on-surface-variant" />
                <input
                  className="w-full cursor-not-allowed rounded-lg border border-dashboard-outline-variant/30 bg-white py-2 pl-10 pr-4 text-sm opacity-70"
                  placeholder="Search not available on Reports yet"
                  type="text"
                  disabled
                  aria-disabled="true"
                />
              </div>
              <nav className="flex items-center gap-5">
                <Link href="/" className="py-4 text-sm text-slate-500 transition-colors hover:text-dashboard-primary">
                  Overview
                </Link>
                <Link
                  href="/analytics"
                  className="py-4 text-sm text-slate-500 transition-colors hover:text-dashboard-primary"
                >
                  Analytics
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <ExportDataButton className="hidden md:block" />
              <NotificationsBellDropdown
                notifications={notificationRows}
                error={notificationsError}
              />
            </div>
          </header>

          <div className="dashboard-content space-y-8">
            <section className="space-y-2">
              <h1 className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-tight text-dashboard-primary">
                <FileText className="h-7 w-7" />
                Reports
              </h1>
              <p className="text-sm text-dashboard-on-surface-variant">
                Internal employee notes linked to properties.
              </p>
            </section>

            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                Could not load reports: {error}
              </div>
            ) : null}

            <section className="grid grid-cols-1 gap-8 xl:grid-cols-3">
              <div className="xl:col-span-1">
                <CreateReportForm properties={properties} />
              </div>
              <div className="xl:col-span-2 space-y-4">
                {reports.length === 0 ? (
                  <div className="rounded-xl border border-dashboard-outline-variant/20 bg-white p-6 text-sm text-dashboard-on-surface-variant shadow-sm">
                    No reports yet. Create your first internal note.
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
                          <p>Created: {formatDateTime(report.created_at)}</p>
                          <p>Updated: {formatDateTime(report.updated_at)}</p>
                        </div>
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-dashboard-on-surface">
                        {report.note_text}
                      </p>
                      <p className="mt-3 text-xs text-dashboard-on-surface-variant">
                        Author: {report.author_name?.trim() || "Unknown"}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

