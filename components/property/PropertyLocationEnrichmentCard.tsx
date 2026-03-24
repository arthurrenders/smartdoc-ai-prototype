import { MapPinned, Sparkles } from "lucide-react"
import type { PropertyAddressRecord } from "@/lib/property-address/types"
import type { PropertyLocationEnrichmentView } from "@/lib/location-enrichment/types"
import { EnrichPropertyLocationButton } from "./EnrichPropertyLocationButton"

type Props = {
  propertyId: string
  address: PropertyAddressRecord | null
  enrichment: PropertyLocationEnrichmentView | null
}

function canEnrich(address: PropertyAddressRecord | null): boolean {
  return (
    address?.geocode_status === "ok" &&
    address.latitude != null &&
    address.longitude != null
  )
}

function enrichmentStale(address: PropertyAddressRecord | null, enrichedAt: string): boolean {
  const g = address?.geocoded_at
  if (!g || !enrichedAt) return false
  return g > enrichedAt
}

function tri(v: boolean | null, okLabel: string, naLabel: string): string {
  if (v === null) return naLabel
  return v ? okLabel : "Afwijking — controleer adres of kaartcontext"
}

export function PropertyLocationEnrichmentCard({ propertyId, address, enrichment }: Props) {
  const enrichAllowed = canEnrich(address)
  const p = enrichment?.payload
  const stale =
    enrichment?.status === "ok" && enrichmentStale(address, enrichment.enriched_at)

  return (
    <div className="saas-card relative overflow-hidden border-l-4 border-l-brand-light/55 bg-gradient-to-br from-brand-light/12 via-white to-white shadow-sm dark:border-l-brand-light/45 dark:from-brand-dark/25 dark:via-card dark:to-card">
      <h2 className="saas-section-heading inline-flex flex-wrap items-center gap-2 text-xl sm:gap-3 sm:text-2xl">
        <span className="inline-flex items-center gap-2">
          <MapPinned className="h-5 w-5 text-brand-dark dark:text-brand-light" aria-hidden />
          <Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-400" aria-hidden />
        </span>
        Locatiecontext (België)
      </h2>
      <p className="saas-section-subheading mb-6 text-muted-foreground/90">
        Eerste verrijkingslaag: validatie tegen kaartdata, genormaliseerde context uit OSM, nabijheid
        van treinstation en bushaltes. Geschikt als basis voor latere risico- of buurtdata.
      </p>

      <div className="mb-4">
        <EnrichPropertyLocationButton propertyId={propertyId} disabled={!enrichAllowed} />
        {!enrichAllowed && (
          <p className="mt-2 text-xs text-muted-foreground">
            Geocodeer eerst het adres om locatieverrijking op te slaan.
          </p>
        )}
      </div>

      {!enrichment && (
        <p className="text-sm text-muted-foreground">
          Nog geen opgeslagen verrijking. Gebruik de knop hierboven na een geslaagde geocoding.
        </p>
      )}

      {enrichment?.status === "error" && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <p className="font-medium text-destructive">Verrijking mislukt</p>
          {enrichment.error_message ? (
            <p className="mt-1 text-foreground/90">{enrichment.error_message}</p>
          ) : null}
        </div>
      )}

      {enrichment?.status === "ok" && !p && (
        <p className="text-sm text-muted-foreground">
          Opgeslagen verrijking heeft een onbekend formaat. Voer opnieuw uit.
        </p>
      )}

      {enrichment?.status === "ok" && p && (
        <div className="space-y-4 text-sm">
          {stale && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              Verrijking kan verouderd zijn t.o.v. de laatste geocoding. Voer opnieuw uit indien het
              adres gewijzigd werd.
            </p>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Validatie (postcode / gemeente)
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-foreground">
              <li>
                Land:{" "}
                {p.validation.inBelgium
                  ? "België (OSM)"
                  : "Niet BE volgens reverse geocode — controleer coördinaten"}
              </li>
              <li>
                Postcode t.o.v. kaart:{" "}
                {tri(
                  p.validation.postcodeConsistent,
                  "Komt overeen met opgeslagen postcode",
                  "Geen vergelijking (ontbrekende data)"
                )}
              </li>
              <li>
                Gemeente t.o.v. kaart:{" "}
                {tri(
                  p.validation.municipalityConsistent,
                  "Sluit aan bij opgeslagen gemeente",
                  "Geen vergelijking (ontbrekende data)"
                )}
              </li>
            </ul>
          </div>

          {p.reverseDisplayName ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kaartlabel (Nominatim)
              </p>
              <p className="mt-1 text-foreground">{p.reverseDisplayName}</p>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bronnen
            </p>
            <p className="mt-1 text-muted-foreground">
              Nominatim reverse: {p.sources.nominatimReverse ? "ja" : "nee"} · Overpass (OV in de
              buurt): {p.sources.overpass ? "ja" : "nee (of geen resultaten)"}
            </p>
          </div>

          {p.nearbyTransport &&
          (p.nearbyTransport.nearestRailStations.length > 0 ||
            p.nearbyTransport.nearestBusStops.length > 0) ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Treinstations (≈ 1,2 km)
                </p>
                <ul className="mt-2 space-y-1">
                  {p.nearbyTransport.nearestRailStations.map((s) => (
                    <li key={`${s.name}-${s.distanceM}`} className="text-foreground">
                      {s.name}{" "}
                      <span className="text-muted-foreground">({s.distanceM} m)</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Bushaltes (≈ 800 m)
                </p>
                <ul className="mt-2 space-y-1">
                  {p.nearbyTransport.nearestBusStops.map((s) => (
                    <li key={`${s.name}-${s.distanceM}`} className="text-foreground">
                      {s.name}{" "}
                      <span className="text-muted-foreground">({s.distanceM} m)</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : p.sources.overpass ? (
            <p className="text-muted-foreground">
              Geen treinstations of bushaltes gevonden binnen de zoekradius (OSM-dekking kan variëren).
            </p>
          ) : (
            <p className="text-muted-foreground">
              Nabije OV-haltes niet opgehaald (Overpass tijdelijk niet beschikbaar of time-out).
            </p>
          )}

          {enrichment.enriched_at ? (
            <p className="text-xs text-muted-foreground">
              Opgeslagen: {enrichment.enriched_at}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
