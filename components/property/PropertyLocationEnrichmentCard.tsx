"use client"

import { useState } from "react"
import { MapPinned, Sparkles, ChevronDown, ChevronUp, Train, Bus, CheckCircle2, XCircle, HelpCircle } from "lucide-react"
import type { PropertyAddressRecord } from "@/lib/property-address/types"
import type { PropertyLocationEnrichmentView } from "@/lib/location-enrichment/types"
import { EnrichPropertyLocationButton } from "./EnrichPropertyLocationButton"

type Props = {
  propertyId: string
  address: PropertyAddressRecord | null
  enrichment: PropertyLocationEnrichmentView | null
  wrapInCard?: boolean
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

function ValidationChip({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
      <HelpCircle className="h-3 w-3" />
      {label}
    </span>
  )
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
      <CheckCircle2 className="h-3 w-3" />
      {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
      <XCircle className="h-3 w-3" />
      {label}
    </span>
  )
}

export function PropertyLocationEnrichmentCard({ propertyId, address, enrichment, wrapInCard = true }: Props) {
  const [open, setOpen] = useState(false)
  const enrichAllowed = canEnrich(address)
  const p = enrichment?.payload
  const stale = enrichment?.status === "ok" && enrichmentStale(address, enrichment.enriched_at)
  const hasTransport = p?.nearbyTransport && (
    p.nearbyTransport.nearestRailStations.length > 0 || p.nearbyTransport.nearestBusStops.length > 0
  )

  const content = (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <MapPinned className="h-4 w-4 text-brand-dark dark:text-brand-light" aria-hidden />
          <Sparkles className="h-3.5 w-3.5 text-amber-500" aria-hidden />
          Locatiecontext
        </h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-expanded={open}
        >
          {open ? <><ChevronUp className="h-3.5 w-3.5" /> Verbergen</> : <><ChevronDown className="h-3.5 w-3.5" /> Tonen</>}
        </button>
      </div>

      {/* Collapsed summary chips */}
      {!open && (
        enrichment?.status === "ok" && p ? (
          <div className="flex flex-wrap gap-1.5">
            <ValidationChip ok={p.validation.inBelgium} label="België" />
            {p.validation.postcodeConsistent !== null && (
              <ValidationChip ok={p.validation.postcodeConsistent} label="Postcode" />
            )}
            {p.validation.municipalityConsistent !== null && (
              <ValidationChip ok={p.validation.municipalityConsistent} label="Gemeente" />
            )}
            {p.nearbyTransport && p.nearbyTransport.nearestRailStations.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                <Train className="h-3 w-3" />
                {p.nearbyTransport.nearestRailStations.length} station{p.nearbyTransport.nearestRailStations.length !== 1 ? "s" : ""}
              </span>
            )}
            {p.nearbyTransport && p.nearbyTransport.nearestBusStops.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                <Bus className="h-3 w-3" />
                {p.nearbyTransport.nearestBusStops.length} halte{p.nearbyTransport.nearestBusStops.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {enrichment?.status === "ok" ? "Verrijkingsdata beschikbaar." : "Nog niet verrijkt — klik Tonen om te starten."}
          </p>
        )
      )}

      {/* Expanded content */}
      {open && (
        <div className="space-y-4 pt-1">
          {stale && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Mogelijk verouderd na laatste geocoding. Voer opnieuw uit.
            </p>
          )}

          <div className="flex items-center gap-2">
            <EnrichPropertyLocationButton propertyId={propertyId} disabled={!enrichAllowed} />
            {!enrichAllowed && (
              <p className="text-xs text-muted-foreground">Geocodeer eerst het adres.</p>
            )}
          </div>

          {enrichment?.status === "error" && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
              <p className="font-medium text-destructive">Verrijking mislukt</p>
              {enrichment.error_message && (
                <p className="mt-1 text-xs text-foreground/80">{enrichment.error_message}</p>
              )}
            </div>
          )}

          {enrichment?.status === "ok" && p && (
            <div className="space-y-4">
              {/* Validation chips */}
              <div className="flex flex-wrap gap-1.5">
                <ValidationChip ok={p.validation.inBelgium} label="België" />
                <ValidationChip ok={p.validation.postcodeConsistent} label="Postcode" />
                <ValidationChip ok={p.validation.municipalityConsistent} label="Gemeente" />
              </div>

              {/* OSM reverse name */}
              {p.reverseDisplayName && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Kaartlabel</p>
                  <p className="text-sm text-foreground">{p.reverseDisplayName}</p>
                </div>
              )}

              {/* Transport */}
              {hasTransport ? (
                <div className="grid grid-cols-2 gap-3">
                  {p.nearbyTransport!.nearestRailStations.length > 0 && (
                    <div>
                      <p className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Train className="h-3 w-3" /> Treinstations
                      </p>
                      <ul className="space-y-1">
                        {p.nearbyTransport!.nearestRailStations.slice(0, 3).map((s) => (
                          <li key={`${s.name}-${s.distanceM}`} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-foreground">{s.name}</span>
                            <span className="shrink-0 text-muted-foreground">{s.distanceM} m</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {p.nearbyTransport!.nearestBusStops.length > 0 && (
                    <div>
                      <p className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <Bus className="h-3 w-3" /> Bushaltes
                      </p>
                      <ul className="space-y-1">
                        {p.nearbyTransport!.nearestBusStops.slice(0, 3).map((s) => (
                          <li key={`${s.name}-${s.distanceM}`} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-foreground">{s.name}</span>
                            <span className="shrink-0 text-muted-foreground">{s.distanceM} m</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Geen OV-haltes gevonden in de buurt.</p>
              )}

              {enrichment.enriched_at && (
                <p className="text-xs text-muted-foreground">Bijgewerkt: {enrichment.enriched_at.slice(0, 10)}</p>
              )}
            </div>
          )}

          {!enrichment && (
            <p className="text-xs text-muted-foreground">
              Nog geen verrijkingsdata. Gebruik de knop hierboven na een geslaagde geocoding.
            </p>
          )}
        </div>
      )}
    </div>
  )

  if (!wrapInCard) return content
  return (
    <div className="saas-card relative overflow-hidden border-l-4 border-l-brand-light/55 bg-gradient-to-br from-brand-light/12 via-white to-white shadow-sm dark:border-l-brand-light/45 dark:from-brand-dark/25 dark:via-card dark:to-card">
      {content}
    </div>
  )
}
