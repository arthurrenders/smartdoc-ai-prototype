import type { Metadata } from "next"
import Link from "next/link"
import {
  Building2,
  AlertTriangle,
  FileQuestion,
  CalendarClock,
  Clock,
  Plus,
} from "lucide-react"

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Overzicht van al uw panden, documenten en deadlines.",
}
import { AppShell } from "@/components/AppShell"
import { getDashboardData } from "@/app/actions/get-dashboard-data"
import { getCalendarDates } from "@/app/actions/get-calendar-dates"
import { getUpcomingDeadlines } from "@/app/actions/get-upcoming-deadlines"
import { getAppointments } from "@/app/actions/get-appointments"
import { getDashboardNotifications } from "@/app/actions/get-dashboard-notifications"
import { syncNotificationsFromDocumentDates } from "@/app/actions/sync-notifications"
import { StatCard } from "@/components/ui/StatCard"
import { PropertyCard } from "@/components/ui/PropertyCard"
import { DocumentCalendar } from "@/components/dashboard/DocumentCalendar"
import { UpcomingDeadlines } from "@/components/dashboard/UpcomingDeadlines"
import { UpcomingAppointments } from "@/components/dashboard/UpcomingAppointments"
import { PropertySearchInput } from "@/components/navigation/PropertySearchInput"
import { DeletePropertyDashboardButton } from "@/components/dashboard/DeletePropertyDashboardButton"
import { streetViewUrl } from "@/lib/streetview"

function formatPropertyName(id: string): string {
  return `Pand ${id.slice(0, 8)}`
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const resolvedSearchParams = (await searchParams) ?? {}
  const searchQuery = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q.trim() : ""
  const [
    { error: syncError },
    { properties, propertyStats, propertiesError, totalPropertiesCount, propertyAddresses },
    { data: calendarEntries, error: calendarError },
    { data: upcomingRows, error: upcomingError },
    { data: notificationRows, error: notificationsError },
    { data: appointmentRows, error: appointmentsError },
  ] = await Promise.all([
    syncNotificationsFromDocumentDates(),
    getDashboardData(searchQuery),
    getCalendarDates(),
    getUpcomingDeadlines(200),
    getDashboardNotifications(25),
    getAppointments({ limit: 50 }),
  ])

  const totalProperties = properties.length
  const conformProperties = properties.filter(
    (p) => propertyStats[p.id]?.status === "green"
  ).length
  const propertiesWithIssues = properties.filter(
    (p) => propertyStats[p.id]?.status === "red" || propertyStats[p.id]?.status === "orange"
  ).length
  const propertiesPendingAnalysis = properties.filter(
    (p) => propertyStats[p.id]?.status === "pending"
  ).length
  const totalMissing = properties.reduce(
    (sum, p) => sum + (propertyStats[p.id]?.missingCount ?? 0),
    0
  )
  const totalPending = properties.reduce(
    (sum, p) => sum + (propertyStats[p.id]?.pendingCount ?? 0),
    0
  )
  const todayIso = new Date().toISOString().slice(0, 10)
  const next30Iso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const totalExpiries = upcomingRows.filter(
    (row) => row.date_on >= todayIso && row.date_on <= next30Iso
  ).length
  const todayAppointments = appointmentRows.filter(
    (a) => a.start_at.slice(0, 10) === todayIso
  ).length
  const propertyOptions = properties.map((p) => ({ id: p.id, display_name: p.display_name ?? null }))

  const topSlot = (
    <PropertySearchInput
      initialQuery={searchQuery}
      placeholder="Panden zoeken..."
      className="hidden w-64 lg:block"
    />
  )

  return (
    <AppShell
      notifications={notificationRows}
      notificationsError={notificationsError}
      topSlot={topSlot}
    >
      <div className="dashboard-content space-y-8">
        {/* KPI row */}
        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5" aria-label="Overzicht statistieken">
          <StatCard
            title="Panden conform"
            value={conformProperties}
            icon={<Building2 className="h-5 w-5" />}
            trendLabel="Geanalyseerd & in orde"
            tone="primary"
          />
          <StatCard
            title="Kritieke panden"
            value={propertiesWithIssues}
            icon={<AlertTriangle className="h-5 w-5" />}
            trendLabel={propertiesWithIssues > 0 ? `${propertiesWithIssues} actief` : "Geen problemen"}
            tone="danger"
          />
          <StatCard
            title="Nog te analyseren"
            value={propertiesPendingAnalysis}
            icon={<Clock className="h-5 w-5" />}
            trendLabel={
              totalPending > 0
                ? `${totalPending} document${totalPending !== 1 ? "en" : ""} wacht`
                : "Alles geanalyseerd"
            }
            tone="info"
          />
          <StatCard
            title="Ontbrekende documenten"
            value={totalMissing}
            icon={<FileQuestion className="h-5 w-5" />}
            trendLabel="Wacht op upload"
            tone="warning"
          />
          <StatCard
            title="Verloopt binnenkort"
            value={totalExpiries}
            icon={<CalendarClock className="h-5 w-5" />}
            trendLabel="Komende 30 dagen"
            tone="info"
          />
        </section>

        {/* Today's appointments strip */}
        {todayAppointments > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm">
            <CalendarClock className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
            <span className="font-semibold text-blue-800">
              {todayAppointments === 1 ? "1 afspraak vandaag" : `${todayAppointments} afspraken vandaag`}
            </span>
            <span className="text-blue-600">
              {appointmentRows
                .filter((a) => a.start_at.slice(0, 10) === todayIso)
                .map((a) => {
                  const sm = a.start_at.match(/T(\d{2}:\d{2})/)
                  return `${sm ? sm[1] : ""} ${a.title}`
                })
                .join(" · ")}
            </span>
          </div>
        )}

        {/* Deadlines + calendar */}
        <section className="grid grid-cols-1 gap-8 lg:grid-cols-2" aria-label="Deadlines en afspraken">
          <div className="space-y-6">
            <UpcomingDeadlines rows={upcomingRows.slice(0, 20)} error={upcomingError} />
            <UpcomingAppointments
              rows={appointmentRows}
              error={appointmentsError}
              properties={propertyOptions}
            />
          </div>
          <div>
            {calendarError && (
              <div
                className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                Kalenderdatums konden niet geladen worden: {calendarError}
              </div>
            )}
            <DocumentCalendar
              entries={calendarEntries}
              appointments={appointmentRows}
              properties={propertyOptions}
              mapHref="/map"
            />
          </div>
        </section>

        {/* Properties grid */}
        <section aria-label="Panden">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="dashboard-section-title text-xl">
              <Building2 className="h-5 w-5" />
              Panden overzicht
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/properties/new"
                className="saas-btn-primary inline-flex items-center gap-2 transition-all duration-200"
              >
                <Plus className="h-4 w-4" />
                Nieuw pand
              </Link>
              <DeletePropertyDashboardButton properties={properties} />
            </div>
          </div>
          {propertiesError && (
            <div
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              Panden konden niet geladen worden: {propertiesError}
            </div>
          )}
          {properties.length === 0 ? (
            <div className="saas-empty-state">
              <Building2 className="h-12 w-12 saas-empty-state-icon sm:h-14 sm:w-14" aria-hidden />
              <p className="saas-empty-state-title">
                {searchQuery ? "Geen panden gevonden" : "Nog geen panden"}
              </p>
              <p className="saas-empty-state-description">
                {searchQuery
                  ? `Geen pand komt overeen met "${searchQuery}". Probeer naam, straat, postcode of gemeente.`
                  : "Gebruik de knop hierboven om een pand toe te voegen."}
              </p>
              {searchQuery && totalPropertiesCount > 0 ? (
                <Link
                  href="/"
                  className="mt-4 inline-flex rounded-lg bg-dashboard-surface-low px-4 py-2 text-sm font-semibold text-dashboard-primary transition-colors hover:bg-dashboard-surface-variant"
                >
                  Zoekopdracht wissen
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
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
                  streetViewUrl={(() => {
                    const addr = propertyAddresses[prop.id]
                    if (!addr || addr.latitude == null || addr.longitude == null) return undefined
                    return streetViewUrl({ latitude: addr.latitude, longitude: addr.longitude }, "400x200")
                  })()}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}
