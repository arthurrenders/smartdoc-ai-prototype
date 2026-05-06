import type { Metadata } from "next"
import nextDynamic from "next/dynamic"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Kaart",
  description: "Geografisch overzicht van al uw panden op de kaart.",
}
import { MapPin } from "lucide-react"
import { getMapMarkers } from "@/app/actions/get-map-markers"
import { getDashboardNotifications } from "@/app/actions/get-dashboard-notifications"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { PropertySearchInput } from "@/components/navigation/PropertySearchInput"
import { MapRefreshButton } from "@/components/map/MapRefreshButton"
import { AppShell } from "@/components/AppShell"

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

  const topSlot = (
    <div className="flex items-center gap-3">
      <PropertySearchInput
        initialQuery={searchQuery}
        placeholder="Panden zoeken op kaart..."
        className="hidden w-64 md:block lg:w-72"
      />
      <MapRefreshButton />
    </div>
  )

  return (
    <AppShell
      notifications={notificationRows}
      notificationsError={notificationsError}
      topSlot={topSlot}
    >
      <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-[#f8fafb]">

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
                {searchQuery ? "Geen overeenkomende panden op de kaart" : "Nog geen punten op de kaart"}
              </p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-dashboard-on-surface-variant">
                {searchQuery
                  ? `Geen geocodeerd pand komt overeen met "${searchQuery}". Probeer naam, straat, postcode of gemeente.`
                  : "Geocodeer een adres op een panddetailpagina (knop \"Geocode adres (België)\"). Daarna verschijnt het pand hier."}
              </p>
              {searchQuery ? (
                <Link
                  href="/map"
                  className="mt-4 inline-flex rounded-lg bg-dashboard-surface-low px-4 py-2 text-sm font-semibold text-dashboard-primary transition-colors hover:bg-dashboard-surface-variant"
                >
                  Zoekopdracht wissen
                </Link>
              ) : null}
            </div>
          ) : !error ? (
            <section className="relative flex min-h-0 flex-1 overflow-hidden bg-dashboard-surface-low/30 p-4" aria-label="Kaart met panden">
              <aside className="z-20 hidden w-96 flex-col overflow-hidden rounded-xl border border-dashboard-outline-variant/20 bg-white shadow-sm lg:flex">
                <div className="border-b border-dashboard-surface-low bg-dashboard-surface p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-bold text-dashboard-primary">Pandenlijst</h3>
                    <span className="rounded-full bg-dashboard-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-dashboard-on-secondary-container">
                      {markers.length} panden
                    </span>
                  </div>
                  <p className="text-xs text-dashboard-on-surface-variant">
                    Klik op een pand om de detailpagina te openen. De statustags komen overeen met de markeringen op de kaart.
                  </p>
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto bg-dashboard-surface-low/30 p-2">
                  {markers.map((marker) => (
                    <Link
                      key={marker.propertyId}
                      href={`/properties/${marker.propertyId}`}
                      className="block rounded-xl border border-transparent p-4 transition-all hover:border-dashboard-surface hover:bg-white"
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
      </div>
    </AppShell>
  )
}
