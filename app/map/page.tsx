import nextDynamic from "next/dynamic"
import Link from "next/link"
import Image from "next/image"
import {
  LayoutDashboard,
  Map as MapIcon,
  MapPin,
  Settings,
  Plus,
} from "lucide-react"
import { getMapMarkers } from "@/app/actions/get-map-markers"
import { getDashboardNotifications } from "@/app/actions/get-dashboard-notifications"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { NotificationsBellDropdown } from "@/components/navigation/NotificationsBellDropdown"
import { ExportDataButton } from "@/components/navigation/ExportDataButton"
import { PropertySearchInput } from "@/components/navigation/PropertySearchInput"
import { MapRefreshButton } from "@/components/map/MapRefreshButton"
import logoImage from "@/components/public/logo png.png"

export const dynamic = "force-dynamic"

const PropertiesMap = nextDynamic(() => import("@/components/map/PropertiesMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full w-full items-center justify-center bg-dashboard-surface-low text-sm text-dashboard-on-surface-variant"
      aria-busy="true"
    >
      Kaart laden…
    </div>
  ),
})

export default async function MapPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const resolvedSearchParams = (await searchParams) ?? {}
  const searchQuery = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q.trim() : ""
  const [{ markers, error }, { data: notificationRows, error: notificationsError }] = await Promise.all([
    getMapMarkers(searchQuery),
    getDashboardNotifications(12),
  ])

  return (
    <div className="overflow-hidden pt-2 sm:pt-3">
      <div className="dashboard-shell h-screen">
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
              className="mb-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-dashboard-primary px-4 py-3 text-sm font-bold text-white transition-all hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New Property
            </Link>
            <nav className="space-y-1">
              <Link
                href="/"
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-dashboard-primary"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link
                href="/map"
                className="flex items-center gap-3 border-r-4 border-dashboard-primary bg-slate-100 px-4 py-3 text-sm font-bold text-dashboard-primary"
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

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-dashboard-background">
          <header className="dashboard-topnav">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <PropertySearchInput
                initialQuery={searchQuery}
                placeholder="Search properties on map..."
                className="hidden w-64 md:block lg:w-72"
              />
              <span className="hidden items-center rounded-full bg-dashboard-secondary-container px-3 py-1 text-xs font-semibold text-dashboard-on-secondary-container xl:inline-flex">
                Map workspace
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-3 md:gap-4">
              <ExportDataButton />
              <div className="flex gap-2">
                <NotificationsBellDropdown
                  notifications={notificationRows}
                  error={notificationsError}
                />
              </div>
            </div>
          </header>

          <div className="border-b border-dashboard-surface bg-white px-8 py-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <nav className="mb-2 flex items-center gap-2 text-xs text-dashboard-on-surface-variant">
                  <span>Properties</span>
                  <span>›</span>
                  <span className="font-semibold text-dashboard-primary">Map View</span>
                </nav>
                <h1 className="text-3xl font-extrabold tracking-tight text-dashboard-primary">
                  Properties on the Map
                </h1>
                <p className="mt-1 text-sm text-dashboard-on-surface-variant">
                  Showing {markers.length} {markers.length === 1 ? "asset" : "assets"} with geocoded coordinates.
                  {searchQuery ? ` (filtered by "${searchQuery}")` : ""}
                </p>
              </div>
              <MapRefreshButton />
            </div>
          </div>

          {error && (
            <div
              className="mx-8 mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              Kaartgegevens konden niet geladen worden: {error}
            </div>
          )}

          {!error && markers.length === 0 ? (
            <div className="m-8 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-dashboard-outline-variant/50 bg-dashboard-surface px-6 py-14 text-center">
              <MapPin className="h-14 w-14 text-dashboard-on-surface-variant/35" aria-hidden />
              <p className="mt-5 text-base font-semibold text-dashboard-on-surface">
                {searchQuery ? "No matching properties on the map" : "Nog geen punten op de kaart"}
              </p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-dashboard-on-surface-variant">
                {searchQuery
                  ? `No geocoded property matches "${searchQuery}". Try name, street, postcode, or municipality.`
                  : "Geocode een adres op een panddetailpagina (knop \"Geocode adres (België)\"). Daarna verschijnt het pand hier."}
              </p>
              {searchQuery ? (
                <Link
                  href="/map"
                  className="mt-4 inline-flex rounded-lg bg-dashboard-surface-low px-4 py-2 text-sm font-semibold text-dashboard-primary transition-colors hover:bg-dashboard-surface-variant"
                >
                  Clear search
                </Link>
              ) : null}
            </div>
          ) : !error ? (
            <section className="relative flex min-h-0 flex-1 overflow-hidden bg-dashboard-surface-low/30 p-4" aria-label="Kaart met panden">
              <aside className="z-20 hidden w-96 flex-col overflow-hidden rounded-xl border border-dashboard-outline-variant/20 bg-white shadow-sm lg:flex">
                <div className="border-b border-dashboard-surface-low bg-dashboard-surface p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-bold text-dashboard-primary">Property List</h3>
                    <span className="rounded-full bg-dashboard-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-dashboard-on-secondary-container">
                      {markers.length} assets
                    </span>
                  </div>
                  <p className="text-xs text-dashboard-on-surface-variant">
                    Select a property to open its detail page. Status tags correspond with markers on the map.
                  </p>
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto bg-dashboard-surface-low/30 p-2">
                  {markers.map((marker, idx) => (
                    <Link
                      key={marker.propertyId}
                      href={`/properties/${marker.propertyId}`}
                      className={`block rounded-xl border p-4 transition-all ${
                        idx === 0
                          ? "border-dashboard-outline-variant/20 bg-white shadow-sm"
                          : "border-transparent hover:border-dashboard-surface hover:bg-white"
                      }`}
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-dashboard-on-surface-variant">
                          {marker.propertyId.slice(0, 8).toUpperCase()}
                        </span>
                        <StatusBadge status={marker.status} />
                      </div>
                      <h4 className="font-bold text-dashboard-on-surface transition-colors hover:text-dashboard-primary">
                        {marker.displayName}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-xs text-dashboard-on-surface-variant">
                        {marker.addressLabel}
                      </p>
                    </Link>
                  ))}
                </div>
              </aside>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-dashboard-outline-variant/20 bg-dashboard-surface shadow-sm">
                <PropertiesMap
                  markers={markers}
                  className="z-0 h-full w-full shadow-none"
                />
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  )
}
