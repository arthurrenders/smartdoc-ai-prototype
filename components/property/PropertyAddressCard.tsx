import { MapPin } from "lucide-react"
import type { PropertyAddressRecord } from "@/lib/property-address/types"
import { formatPropertyAddressLines } from "@/lib/property-address/format-display"
import { GeocodePropertyAddressButton } from "./GeocodePropertyAddressButton"
import { EditPropertyAddressButton } from "./EditPropertyAddressButton"
import { chooseGeocodeCandidate } from "@/app/actions/geocode-property-address"
import { decodeGeocodeCandidatesState } from "@/lib/geocoding/geocode-candidate-state"

type Props = {
  propertyId: string
  address: PropertyAddressRecord | null
}

function geocodeStatusLabel(status: string): string {
  switch (status) {
    case "ok":
      return "Geocoding gelukt"
    case "pending":
      return "Nog niet gegeocodeerd"
    case "no_result":
      return "Geen resultaat"
    case "ambiguous":
      return "Meerdere locaties"
    case "error":
      return "Technische fout"
    case "skipped_no_input":
      return "Overgeslagen (leeg adres)"
    default:
      return status
  }
}

function geocodeStatusBadgeClass(status: string): string {
  const base =
    "inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-tight"
  switch (status) {
    case "ok":
      return `${base} border-green-200/80 bg-green-100 text-green-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200`
    case "pending":
      return `${base} border-gray-200 bg-gray-100 text-gray-700 dark:border-border dark:bg-muted dark:text-muted-foreground`
    case "no_result":
    case "ambiguous":
      return `${base} border-orange-200/80 bg-orange-100 text-orange-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200`
    case "error":
    case "skipped_no_input":
      return `${base} border-red-200/80 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200`
    default:
      return `${base} border-gray-200 bg-gray-100 text-gray-700 dark:border-border dark:bg-muted dark:text-muted-foreground`
  }
}

function hasStructuredFields(a: PropertyAddressRecord): boolean {
  return Boolean(
    a.street_name ||
      a.house_number ||
      a.box ||
      a.postal_code ||
      a.municipality ||
      a.region
  )
}

export function PropertyAddressCard({ propertyId, address }: Props) {
  const candidateState = decodeGeocodeCandidatesState(address?.geocode_error ?? null)
  console.info("[SmartDoc][geocode-ui] render state", {
    propertyId,
    status: address?.geocode_status ?? "no_address",
    rawLine1: address?.raw_line1 ?? null,
    hasCandidateState: Boolean(candidateState),
    candidateCount: candidateState?.candidates.length ?? 0,
  })

  return (
    <div className="saas-card">
      <h2 className="saas-section-heading inline-flex items-center gap-2 text-xl sm:text-2xl">
        <MapPin className="h-5 w-5 text-brand-dark dark:text-brand-light" aria-hidden />
        Adres
      </h2>
      <p className="saas-section-subheading mb-6 text-muted-foreground/90">
        Gestructureerd adres (België); coördinaten via onderstaande knop. Kaart volgt later. Bron:{" "}
        <code className="rounded-md bg-muted/80 px-1.5 py-0.5 text-xs font-medium text-foreground/80">
          {address?.source ?? "—"}
        </code>
      </p>
      {!address ? (
        <p className="text-sm text-muted-foreground">
          Nog geen adresregistratie voor dit pand. De titel hierboven komt uit{" "}
          <code className="rounded bg-muted px-1 text-xs">display_name</code>.
        </p>
      ) : (
        <div className="space-y-6 text-sm">
          <div className="rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50/90 to-white p-5 shadow-sm dark:border-border dark:from-muted/40 dark:to-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Geocoding
              </p>
              <span
                className={geocodeStatusBadgeClass(address.geocode_status ?? "pending")}
                aria-label={`Geocodestatus: ${geocodeStatusLabel(address.geocode_status ?? "pending")}`}
              >
                {geocodeStatusLabel(address.geocode_status ?? "pending")}
              </span>
            </div>
            {address.geocode_error ? (
              <p className="mt-3 text-sm text-destructive" role="status">
                {candidateState?.detail ?? address.geocode_error}
              </p>
            ) : null}
            {address.geocode_status === "ok" ? (
              <div className="mt-3 rounded-lg border border-[#519fc8]/30 bg-[#519fc8]/10 px-3 py-2 text-sm text-[#0e3b6a]">
                Locatie bevestigd en opgeslagen.
                {address.normalized_full_address ? (
                  <span className="block text-xs text-[#0e3b6a]/80">{address.normalized_full_address}</span>
                ) : null}
              </div>
            ) : null}
            {candidateState && candidateState.candidates.length > 0 ? (
              <div className="mt-3 space-y-3 rounded-lg border border-[#519fc8]/30 bg-[#519fc8]/5 p-4">
                <p className="text-sm font-semibold text-[#0e3b6a]">
                  {candidateState.kind === "ambiguous_candidates"
                    ? "We found several possible matches. Please choose the correct one."
                    : "Did you mean one of these locations?"}
                </p>
                <ul className="space-y-2">
                  {candidateState.candidates.map((c, idx) => (
                    <li key={`${c.latitude}-${c.longitude}-${idx}`}>
                      <form
                        action={chooseGeocodeCandidate}
                        className="flex items-center justify-between gap-3 rounded-lg border border-[#0e3b6a]/10 bg-white p-3"
                      >
                        <input type="hidden" name="propertyId" value={propertyId} />
                        <input type="hidden" name="candidateIndex" value={String(idx)} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{c.displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {[c.postalCode, c.municipality, (c.countryCode ?? "be").toUpperCase()]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <button
                          type="submit"
                          className="inline-flex whitespace-nowrap rounded-md bg-[#0e3b6a] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0b3158]"
                        >
                          Gebruik
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-5">
              <GeocodePropertyAddressButton
                propertyId={propertyId}
                rawLine1={address.raw_line1}
              />
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ruwe invoer
              </p>
              <EditPropertyAddressButton
                propertyId={propertyId}
                initialRawLine1={address.raw_line1}
              />
            </div>
            <p className="mt-1 text-foreground">{address.raw_line1}</p>
          </div>
          {address.normalized_full_address?.trim() && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Genormaliseerd (canonical)
              </p>
              <p className="mt-1 text-foreground">{address.normalized_full_address.trim()}</p>
            </div>
          )}
          {hasStructuredFields(address) && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Gestructureerd
              </p>
              <address className="mt-1 not-italic text-foreground">
                {formatPropertyAddressLines(address).map((line, i) => (
                  <span key={`${i}-${line}`} className="block">
                    {line}
                  </span>
                ))}
              </address>
            </div>
          )}
          {!hasStructuredFields(address) && !address.normalized_full_address?.trim() && (
            <p className="text-muted-foreground">
              Nog geen genormaliseerde velden; geschikt voor toekomstige geocoding.
            </p>
          )}
          {address.latitude != null && address.longitude != null && (
            <p className="text-xs text-muted-foreground">
              Coördinaten: {Number(address.latitude).toFixed(5)},{" "}
              {Number(address.longitude).toFixed(5)}
              {address.geocoded_at ? (
                <span className="ml-1">· geocode: {address.geocoded_at}</span>
              ) : null}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
