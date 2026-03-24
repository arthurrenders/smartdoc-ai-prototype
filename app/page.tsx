import Link from "next/link"
import {
  Building2,
  AlertTriangle,
  FileQuestion,
  CalendarClock,
  Plus,
  Map as MapIcon,
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
    <div className="saas-page">
      {/* Header */}
      <header className="mb-10 sm:mb-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Property Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Overview of your properties and document compliance status
            </p>
          </div>
          <Link
            href="/map"
            className="saas-btn-secondary inline-flex shrink-0 items-center justify-center gap-2 self-start transition-all duration-200"
          >
            <MapIcon className="h-4 w-4" aria-hidden />
            Kaart
          </Link>
        </div>
      </header>

      {/* Summary stats */}
      <section className="mb-10 sm:mb-12" aria-label="Summary statistics">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          <StatCard
            title="Total properties"
            value={totalProperties}
            icon={<Building2 className="h-5 w-5" />}
          />
          <StatCard
            title="Properties with issues"
            value={propertiesWithIssues}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <StatCard
            title="Missing documents"
            value={totalMissing}
            icon={<FileQuestion className="h-5 w-5" />}
          />
          <StatCard
            title="Upcoming expiries"
            value={totalExpiries}
            icon={<CalendarClock className="h-5 w-5" />}
          />
        </div>
      </section>

      <section
        className="mb-10 sm:mb-12 grid grid-cols-1 gap-8 rounded-2xl bg-slate-50/80 p-6 sm:p-8 lg:grid-cols-2 dark:bg-muted/20"
        aria-label="Deadlines and notifications"
      >
        <UpcomingDeadlines rows={upcomingRows} error={upcomingError} />
        <InAppNotificationsCard
          notifications={notificationRows}
          error={notificationsError}
          syncNote={syncError ? `Synchronisatie meldingen: ${syncError}` : null}
        />
      </section>

      <section className="mb-10 sm:mb-12" aria-label="Document calendar">
        {calendarError && (
          <div
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            Kalenderdatums konden niet geladen worden: {calendarError}
          </div>
        )}
        <DocumentCalendar entries={calendarEntries} mapHref="/map" />
      </section>

      {/* Property grid */}
      <section aria-label="Properties">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="saas-section-heading text-xl sm:text-2xl">Properties</h2>
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
            <Building2 className="h-12 w-12 sm:h-14 sm:w-14 saas-empty-state-icon" aria-hidden />
            <p className="saas-empty-state-title">No properties yet</p>
            <p className="saas-empty-state-description">
              Use the button above to add a property, or set DEMO_PROPERTY_ID
              in .env to see a demo property.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
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
  )
}
