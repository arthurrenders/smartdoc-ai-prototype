import Link from "next/link"
import Image from "next/image"
import {
  BarChart3,
  Building2,
  CalendarClock,
  FileQuestion,
  LayoutDashboard,
  Map as MapIcon,
  PieChart,
  Plus,
  Search,
  Settings,
  TriangleAlert,
} from "lucide-react"
import { getDashboardData } from "@/app/actions/get-dashboard-data"
import { getDashboardNotifications } from "@/app/actions/get-dashboard-notifications"
import { getUpcomingDeadlines } from "@/app/actions/get-upcoming-deadlines"
import { createServerClient } from "@/lib/supabase/server"
import { REQUIRED_DOCUMENT_TYPE_NAMES } from "@/lib/property-status"
import { getCurrentDocumentsByType } from "@/lib/current-documents"
import { pickLatestAnalysisRun } from "@/lib/pick-latest-analysis-run"
import logoImage from "@/components/public/logo png.png"
import { NotificationsBellDropdown } from "@/components/navigation/NotificationsBellDropdown"
import { ExportDataButton } from "@/components/navigation/ExportDataButton"

type RawDocRow = {
  id: string
  property_id: string
  document_type_id: string | null
  created_at: string | null
  document_types?: { id: string; name: string } | null
  analysis_runs?: Array<{
    id: string
    created_at?: string
    result_json?: {
      flags?: Array<{ severity?: string; title?: string; details?: string }>
    } | null
  }> | null
}

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

export default async function AnalyticsPage() {
  const [{ properties, propertyStats, documentTypes }, upcoming, { data: notificationRows, error: notificationsError }] = await Promise.all([
    getDashboardData(),
    getUpcomingDeadlines(200),
    getDashboardNotifications(12),
  ])

  const supabase = createServerClient()
  const propertyIds = properties.map((p) => p.id)

  const { data: docsData } = await supabase
    .from("documents")
    .select(
      "id, property_id, document_type_id, created_at, document_types(id, name), analysis_runs(id, created_at, result_json)"
    )
    .in("property_id", propertyIds)
    .order("created_at", { ascending: false })
    .order("created_at", { foreignTable: "analysis_runs", ascending: false })

  const docs = ((docsData as RawDocRow[] | null) ?? []).filter(
    (d): d is RawDocRow => Boolean(d?.property_id)
  )

  const docsByProperty = new Map<string, RawDocRow[]>()
  for (const d of docs) {
    const list = docsByProperty.get(d.property_id) ?? []
    list.push(d)
    docsByProperty.set(d.property_id, list)
  }

  const currentDocs = Array.from(docsByProperty.values()).flatMap((rows) =>
    getCurrentDocumentsByType(rows)
  )

  const propertyStatusCounts = {
    green: properties.filter((p) => propertyStats[p.id]?.status === "green").length,
    orange: properties.filter((p) => propertyStats[p.id]?.status === "orange").length,
    red: properties.filter((p) => propertyStats[p.id]?.status === "red").length,
  }

  const totalProperties = properties.length
  const propertiesWithIssues = totalProperties - propertyStatusCounts.green
  const totalDocuments = currentDocs.length
  const missingDocuments = properties.reduce(
    (sum, p) => sum + (propertyStats[p.id]?.missingCount ?? 0),
    0
  )
  const upcomingExpiries = properties.reduce(
    (sum, p) => sum + (propertyStats[p.id]?.expiriesCount ?? 0),
    0
  )

  let totalRedFlags = 0
  for (const d of currentDocs) {
    const latest = pickLatestAnalysisRun((d as RawDocRow).analysis_runs)
    const flags = latest?.result_json?.flags
    if (!Array.isArray(flags)) continue
    totalRedFlags += flags.filter((f) => f?.severity === "red").length
  }

  const documentsByType = new Map<string, number>()
  for (const d of currentDocs) {
    const name = d.document_types?.name ?? "Unknown"
    documentsByType.set(name, (documentsByType.get(name) ?? 0) + 1)
  }
  const docsByTypeRows = [...documentsByType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const requiredTypeIds = new Set(
    documentTypes
      .filter((dt) =>
        REQUIRED_DOCUMENT_TYPE_NAMES.includes(dt.name as (typeof REQUIRED_DOCUMENT_TYPE_NAMES)[number])
      )
      .map((dt) => dt.id)
  )
  const missingByType = new Map<string, number>()
  for (const dt of documentTypes.filter((d) => requiredTypeIds.has(d.id))) {
    missingByType.set(dt.name, 0)
  }
  for (const p of properties) {
    const propCurrent = getCurrentDocumentsByType(docsByProperty.get(p.id) ?? [])
    const presentIds = new Set(propCurrent.map((d) => d.document_type_id).filter(Boolean))
    for (const dt of documentTypes.filter((d) => requiredTypeIds.has(d.id))) {
      if (!presentIds.has(dt.id)) {
        missingByType.set(dt.name, (missingByType.get(dt.name) ?? 0) + 1)
      }
    }
  }
  const missingByTypeRows = [...missingByType.entries()].sort((a, b) => b[1] - a[1])

  const expiriesByMonth = new Map<string, number>()
  for (const row of upcoming.data) {
    const key = monthKey(row.date_on)
    expiriesByMonth.set(key, (expiriesByMonth.get(key) ?? 0) + 1)
  }
  const expiryMonthRows = [...expiriesByMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 6)

  const propertyNameById = new Map(properties.map((p) => [p.id, p.display_name ?? `Property ${p.id.slice(0, 8)}`]))
  const recentDocuments = currentDocs
    .slice()
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .slice(0, 6)
  const recentProperties = properties
    .slice()
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
    .slice(0, 6)

  return (
    <div className="-mt-10 sm:-mt-12 lg:-mt-16">
      <div className="dashboard-shell">
        <aside className="dashboard-sidenav">
          <div className="p-6">
            <div className="mb-6 px-4">
              <Image src={logoImage} alt="SmartDoc AI logo" width={528} height={132} className="h-24 w-auto max-w-full object-contain" priority />
            </div>
            <Link href="/properties/new" className="mb-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-dashboard-primary px-4 py-3 text-sm font-bold text-white transition-all hover:opacity-90">
              <Plus className="h-4 w-4" />
              New Property
            </Link>
            <nav className="space-y-1">
              <Link href="/" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-dashboard-primary">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link href="/map" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-dashboard-primary">
                <MapIcon className="h-4 w-4" />
                Map View
              </Link>
            </nav>
          </div>
          <div className="mt-auto border-t border-dashboard-outline-variant/40 p-6">
            <Link href="/settings" className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:text-dashboard-primary">
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
                  placeholder="Search not available on Analytics yet"
                  type="text"
                  disabled
                  aria-disabled="true"
                />
              </div>
              <nav className="flex items-center gap-5">
                <Link href="/" className="py-4 text-sm text-slate-500 transition-colors hover:text-dashboard-primary">
                  Overview
                </Link>
                <Link href="/analytics" className="flex h-16 items-center border-b-2 border-dashboard-primary text-sm font-semibold text-dashboard-primary">
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
            <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-6">
              {[
                ["Total properties", totalProperties, "text-dashboard-primary"],
                ["Properties with issues", propertiesWithIssues, "text-dashboard-error"],
                ["Total documents", totalDocuments, "text-dashboard-primary-container"],
                ["Missing documents", missingDocuments, "text-dashboard-tertiary-fixed-dim"],
                ["Upcoming expiries", upcomingExpiries, "text-dashboard-primary"],
                ["Total red flags", totalRedFlags, "text-dashboard-error"],
              ].map(([label, value, tone]) => (
                <article key={label} className="rounded-xl border border-dashboard-outline-variant/20 bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-dashboard-on-surface-variant">{label}</p>
                  <p className={`mt-2 text-3xl font-bold ${tone}`}>{value}</p>
                </article>
              ))}
            </section>

            <section className="grid grid-cols-1 gap-8 xl:grid-cols-2">
              <article className="rounded-xl border border-dashboard-outline-variant/20 bg-white p-6 shadow-sm">
                <h2 className="inline-flex items-center gap-2 text-lg font-bold text-dashboard-primary">
                  <BarChart3 className="h-5 w-5" />
                  Documents by type
                </h2>
                <div className="mt-4 space-y-3">
                  {docsByTypeRows.map(([name, count]) => (
                    <div key={name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{name}</span>
                        <span className="text-dashboard-on-surface-variant">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-dashboard-surface-low">
                        <div className="h-2 rounded-full bg-[#519fc8]" style={{ width: `${pct(count, Math.max(totalDocuments, 1))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-xl border border-dashboard-outline-variant/20 bg-white p-6 shadow-sm">
                <h2 className="inline-flex items-center gap-2 text-lg font-bold text-dashboard-primary">
                  <PieChart className="h-5 w-5" />
                  Property status distribution
                </h2>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    ["Green", propertyStatusCounts.green, "bg-emerald-500"],
                    ["Orange", propertyStatusCounts.orange, "bg-amber-500"],
                    ["Red", propertyStatusCounts.red, "bg-red-500"],
                  ].map(([name, count, bg]) => (
                    <div key={name} className="rounded-lg border border-dashboard-outline-variant/20 bg-dashboard-surface-low p-3 text-center">
                      <div className={`mx-auto mb-2 h-2 w-10 rounded-full ${bg}`} />
                      <p className="text-xs text-dashboard-on-surface-variant">{name}</p>
                      <p className="text-xl font-bold text-dashboard-primary">{count}</p>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="grid grid-cols-1 gap-8 xl:grid-cols-2">
              <article className="rounded-xl border border-dashboard-outline-variant/20 bg-white p-6 shadow-sm">
                <h2 className="inline-flex items-center gap-2 text-lg font-bold text-dashboard-primary">
                  <CalendarClock className="h-5 w-5" />
                  Upcoming expiries by month
                </h2>
                <div className="mt-4 space-y-3">
                  {expiryMonthRows.length === 0 ? (
                    <p className="text-sm text-dashboard-on-surface-variant">No upcoming expiries in current range.</p>
                  ) : (
                    expiryMonthRows.map(([month, count]) => (
                      <div key={month} className="flex items-center justify-between rounded-lg bg-dashboard-surface-low px-3 py-2 text-sm">
                        <span className="font-medium text-foreground">{month}</span>
                        <span className="font-semibold text-dashboard-primary">{count}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="rounded-xl border border-dashboard-outline-variant/20 bg-white p-6 shadow-sm">
                <h2 className="inline-flex items-center gap-2 text-lg font-bold text-dashboard-primary">
                  <FileQuestion className="h-5 w-5" />
                  Missing documents by type
                </h2>
                <div className="mt-4 space-y-3">
                  {missingByTypeRows.map(([name, count]) => (
                    <div key={name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{name}</span>
                        <span className="text-dashboard-on-surface-variant">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-dashboard-surface-low">
                        <div className="h-2 rounded-full bg-[#0e3b6a]" style={{ width: `${pct(count, Math.max(totalProperties, 1))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="grid grid-cols-1 gap-8 xl:grid-cols-2">
              <article className="rounded-xl border border-dashboard-outline-variant/20 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold text-dashboard-primary">Recently uploaded documents</h2>
                <ul className="mt-4 space-y-2">
                  {recentDocuments.length === 0 ? (
                    <li className="text-sm text-dashboard-on-surface-variant">No recent documents.</li>
                  ) : (
                    recentDocuments.map((d) => (
                      <li key={d.id} className="flex items-center justify-between rounded-lg bg-dashboard-surface-low px-3 py-2 text-sm">
                        <span className="min-w-0 truncate font-medium text-foreground">
                          {d.document_types?.name ?? "Unknown"} · {propertyNameById.get(d.property_id) ?? "Property"}
                        </span>
                        <span className="ml-3 shrink-0 text-xs text-dashboard-on-surface-variant">
                          {d.created_at ? new Date(d.created_at).toLocaleDateString() : "—"}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </article>

              <article className="rounded-xl border border-dashboard-outline-variant/20 bg-white p-6 shadow-sm">
                <h2 className="inline-flex items-center gap-2 text-lg font-bold text-dashboard-primary">
                  <TriangleAlert className="h-5 w-5 text-[#519fc8]" />
                  Recently created properties
                </h2>
                <ul className="mt-4 space-y-2">
                  {recentProperties.length === 0 ? (
                    <li className="text-sm text-dashboard-on-surface-variant">No recent properties.</li>
                  ) : (
                    recentProperties.map((p) => (
                      <li key={p.id} className="flex items-center justify-between rounded-lg bg-dashboard-surface-low px-3 py-2 text-sm">
                        <span className="min-w-0 truncate font-medium text-foreground">{p.display_name ?? `Property ${p.id.slice(0, 8)}`}</span>
                        <span className="ml-3 shrink-0 text-xs text-dashboard-on-surface-variant">
                          {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </article>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

