import Link from "next/link"
import Image from "next/image"
import {
  Building2,
  AlertTriangle,
  FileQuestion,
  CalendarClock,
  Plus,
  Map as MapIcon,
  Settings,
  LayoutDashboard,
  Upload,
} from "lucide-react"
import { getDashboardData } from "@/app/actions/get-dashboard-data"
import { getCalendarDates } from "@/app/actions/get-calendar-dates"
import { getUpcomingDeadlines } from "@/app/actions/get-upcoming-deadlines"
import { getDashboardNotifications } from "@/app/actions/get-dashboard-notifications"
import { syncNotificationsFromDocumentDates } from "@/app/actions/sync-notifications"
import { StatCard } from "@/components/ui/StatCard"
import { PropertyCard } from "@/components/ui/PropertyCard"
import { DocumentCalendar } from "@/components/dashboard/DocumentCalendar"
import { UpcomingDeadlines } from "@/components/dashboard/UpcomingDeadlines"
import { InAppNotificationsCard } from "@/components/dashboard/InAppNotificationsCard"
import { NotificationsBellDropdown } from "@/components/navigation/NotificationsBellDropdown"
import { ExportDataButton } from "@/components/navigation/ExportDataButton"
import { PropertySearchInput } from "@/components/navigation/PropertySearchInput"
import logoImage from "@/components/public/logo png.png"

function formatPropertyName(id: string): string {
  return `Property ${id.slice(0, 8)}`
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const resolvedSearchParams = (await searchParams) ?? {}
  const searchQuery = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q.trim() : ""
  const { error: syncError } = await syncNotificationsFromDocumentDates()
  const [
    { properties, propertyStats, propertiesError, totalPropertiesCount },
    { data: calendarEntries, error: calendarError },
    { data: upcomingRows, error: upcomingError },
    { data: notificationRows, error: notificationsError },
  ] = await Promise.all([
    getDashboardData(searchQuery),
    getCalendarDates(),
    getUpcomingDeadlines(200),
    getDashboardNotifications(25),
  ])

  const totalProperties = properties.length
  const propertiesWithIssues = properties.filter(
    (p) => propertyStats[p.id]?.status !== "green"
  ).length
  const totalMissing = properties.reduce(
    (sum, p) => sum + (propertyStats[p.id]?.missingCount ?? 0),
    0
  )
  const todayIso = new Date().toISOString().slice(0, 10)
  const next30Iso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  const totalExpiries = upcomingRows.filter(
    (row) => row.date_on >= todayIso && row.date_on <= next30Iso
  ).length

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
                className="flex items-center gap-3 rounded-xl border-r-4 border-dashboard-primary bg-slate-100 px-4 py-3 text-sm font-semibold text-dashboard-primary"
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
            <nav className="space-y-1">
              <Link
                href="/settings"
                className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:text-dashboard-primary"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </nav>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="dashboard-topnav">
            <div className="flex items-center gap-8">
              <PropertySearchInput
                initialQuery={searchQuery}
                placeholder="Search properties..."
                className="hidden w-64 lg:block"
              />
              <nav className="flex items-center gap-5">
                <a
                  href="#"
                  className="flex h-16 items-center border-b-2 border-dashboard-primary text-sm font-semibold text-dashboard-primary"
                >
                  Overview
                </a>
                <Link href="/analytics" className="py-4 text-sm text-slate-500 transition-colors hover:text-dashboard-primary">
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
            <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4" aria-label="Summary statistics">
              <StatCard
                title="Total properties"
                value={totalProperties}
                icon={<Building2 className="h-5 w-5" />}
                trendLabel="+4%"
                tone="primary"
              />
              <StatCard
                title="Properties with issues"
                value={propertiesWithIssues}
                icon={<AlertTriangle className="h-5 w-5" />}
                trendLabel={`${propertiesWithIssues > 0 ? "+" : ""}${propertiesWithIssues} active`}
                tone="danger"
              />
              <StatCard
                title="Missing documents"
                value={totalMissing}
                icon={<FileQuestion className="h-5 w-5" />}
                trendLabel="Awaiting upload"
                tone="warning"
              />
              <StatCard
                title="Upcoming expiries"
                value={totalExpiries}
                icon={<CalendarClock className="h-5 w-5" />}
                trendLabel="Next 30 days"
                tone="info"
              />
            </section>

            <section className="grid grid-cols-1 gap-8 lg:grid-cols-3" aria-label="Deadlines and notifications">
              <UpcomingDeadlines rows={upcomingRows.slice(0, 20)} error={upcomingError} />
              <InAppNotificationsCard
                notifications={notificationRows}
                error={notificationsError}
                syncNote={syncError ? `Synchronisatie meldingen: ${syncError}` : null}
              />
              <div>
                {calendarError && (
                  <div
                    className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    role="alert"
                  >
                    Kalenderdatums konden niet geladen worden: {calendarError}
                  </div>
                )}
                <DocumentCalendar entries={calendarEntries} mapHref="/map" />
              </div>
            </section>

            <section aria-label="Properties">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="dashboard-section-title text-xl">
                  <Building2 className="h-5 w-5" />
                  Key Properties
                </h2>
                <Link
                  href="/properties/new"
                  className="saas-btn-primary inline-flex items-center gap-2 transition-all duration-200"
                >
                  <Plus className="h-4 w-4" />
                  Add property
                </Link>
              </div>
              {propertiesError && (
                <div
                  className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  role="alert"
                >
                  Could not load properties from Supabase: {propertiesError}
                </div>
              )}
              {properties.length === 0 ? (
                <div className="saas-empty-state">
                  <Building2 className="h-12 w-12 saas-empty-state-icon sm:h-14 sm:w-14" aria-hidden />
                  <p className="saas-empty-state-title">
                    {searchQuery ? "No matching properties" : "No properties yet"}
                  </p>
                  <p className="saas-empty-state-description">
                    {searchQuery
                      ? `No property matches "${searchQuery}". Try name, street, postcode, or municipality.`
                      : "Use the button above to add a property, or set DEMO_PROPERTY_ID in .env to see a demo property."}
                  </p>
                  {searchQuery && totalPropertiesCount > 0 ? (
                    <Link
                      href="/"
                      className="mt-4 inline-flex rounded-lg bg-dashboard-surface-low px-4 py-2 text-sm font-semibold text-dashboard-primary transition-colors hover:bg-dashboard-surface-variant"
                    >
                      Clear search
                    </Link>
                  ) : null}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
                  {properties.map((prop) => (
                    <PropertyCard
                      key={prop.id}
                      id={prop.id}
                      nameOrAddress={prop.display_name ?? formatPropertyName(prop.id)}
                      stats={
                        propertyStats[prop.id] ?? {
                          missingCount: 0,
                          expiriesCount: 0,
                          status: "red",
                          documentCount: 0,
                        }
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
      <button className="fixed bottom-8 right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-dashboard-primary text-white shadow-lg transition-all hover:scale-105">
        <Upload className="h-6 w-6" />
      </button>
    </div>
  )
}
