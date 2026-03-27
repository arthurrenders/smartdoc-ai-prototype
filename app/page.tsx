import Link from "next/link"
import {
  Building2,
  AlertTriangle,
  FileQuestion,
  CalendarClock,
  Plus,
  Map as MapIcon,
  Search,
  Bell,
  UserCircle2,
  FileDown,
  Settings,
  CircleHelp,
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

function formatPropertyName(id: string): string {
  return `Property ${id.slice(0, 8)}`
}

export default async function DashboardPage() {
  const { error: syncError } = await syncNotificationsFromDocumentDates()
  const [
    { properties, propertyStats, propertiesError },
    { data: calendarEntries, error: calendarError },
    { data: upcomingRows, error: upcomingError },
    { data: notificationRows, error: notificationsError },
  ] = await Promise.all([
    getDashboardData(),
    getCalendarDates(),
    getUpcomingDeadlines(20),
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
  const totalExpiries = properties.reduce(
    (sum, p) => sum + (propertyStats[p.id]?.expiriesCount ?? 0),
    0
  )

  return (
    <div className="-mt-10 sm:-mt-12 lg:-mt-16">
      <div className="dashboard-shell">
        <aside className="dashboard-sidenav">
          <div className="p-6">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dashboard-primary text-white">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-dashboard-primary">SmartDoc AI</h1>
                <p className="text-[10px] uppercase tracking-[0.22em] text-dashboard-on-surface-variant/70">
                  Editorial Intelligence
                </p>
              </div>
            </div>
            <Link
              href="/properties/new"
              className="mb-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-dashboard-primary px-4 py-3 text-sm font-bold text-white transition-all hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New Report
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
              <a
                href="#"
                className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:text-dashboard-primary"
              >
                <Settings className="h-4 w-4" />
                Settings
              </a>
              <a
                href="#"
                className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:text-dashboard-primary"
              >
                <CircleHelp className="h-4 w-4" />
                Support
              </a>
            </nav>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="dashboard-topnav">
            <div className="flex items-center gap-8">
              <div className="relative hidden w-64 lg:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dashboard-on-surface-variant" />
                <input
                  className="w-full rounded-lg border border-dashboard-outline-variant/30 bg-white py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-primary/30"
                  placeholder="Search properties..."
                  type="text"
                />
              </div>
              <nav className="flex items-center gap-6">
                <a
                  href="#"
                  className="flex h-16 items-center border-b-2 border-dashboard-primary text-sm font-semibold text-dashboard-primary"
                >
                  Overview
                </a>
                <a href="#" className="py-4 text-sm text-slate-500 transition-colors hover:text-dashboard-primary">
                  Analytics
                </a>
                <a href="#" className="py-4 text-sm text-slate-500 transition-colors hover:text-dashboard-primary">
                  Reports
                </a>
              </nav>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <button className="hidden rounded-lg bg-dashboard-surface-high px-4 py-2 text-sm font-medium text-dashboard-primary transition-all hover:opacity-85 md:inline-flex md:items-center md:gap-2">
                <FileDown className="h-4 w-4" />
                Export Data
              </button>
              <button className="rounded-full p-2 text-dashboard-on-surface-variant transition-all hover:bg-dashboard-surface-low">
                <Bell className="h-5 w-5" />
              </button>
              <button className="rounded-full p-2 text-dashboard-on-surface-variant transition-all hover:bg-dashboard-surface-low">
                <UserCircle2 className="h-5 w-5" />
              </button>
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
              <UpcomingDeadlines rows={upcomingRows} error={upcomingError} />
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
                  <p className="saas-empty-state-title">No properties yet</p>
                  <p className="saas-empty-state-description">
                    Use the button above to add a property, or set DEMO_PROPERTY_ID
                    in .env to see a demo property.
                  </p>
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
