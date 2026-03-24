import nextDynamic from "next/dynamic"
import Link from "next/link"
import { ChevronLeft, Map as MapIcon, MapPin } from "lucide-react"
import { getMapMarkers } from "@/app/actions/get-map-markers"

export const dynamic = "force-dynamic"

const PropertiesMap = nextDynamic(() => import("@/components/map/PropertiesMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[min(70vh,560px)] w-full items-center justify-center rounded-2xl border border-[hsl(var(--border))] bg-muted/25 text-sm text-muted-foreground shadow-sm"
      aria-busy="true"
    >
      Kaart laden…
    </div>
  ),
})

export default async function MapPage() {
  const { markers, error } = await getMapMarkers()

  return (
    <div className="saas-page">
      <header className="mb-10 sm:mb-12">
        <Link
          href="/"
          className="mb-5 inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-all duration-200 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Terug naar dashboard
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <MapIcon className="h-9 w-9 text-brand-dark dark:text-brand-light" aria-hidden />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Panden op de kaart
            </h1>
            <p className="mt-2 text-sm text-muted-foreground sm:text-base">
              Alleen panden met geocodeerde coördinaten (
              {markers.length === 1 ? "1 pand" : `${markers.length} panden`})
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div
          className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          Kaartgegevens konden niet geladen worden: {error}
        </div>
      )}

      {!error && markers.length === 0 ? (
        <div className="saas-card flex flex-col items-center px-6 py-14 text-center">
          <MapPin className="h-14 w-14 text-muted-foreground/35" aria-hidden />
          <p className="mt-5 text-base font-semibold text-foreground">Nog geen punten op de kaart</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Geocode een adres op een panddetailpagina (knop &quot;Geocode adres (België)&quot;).
            Daarna verschijnt het pand hier.
          </p>
        </div>
      ) : !error ? (
        <section aria-label="Kaart met panden">
          <PropertiesMap markers={markers} />
        </section>
      ) : null}
    </div>
  )
}
