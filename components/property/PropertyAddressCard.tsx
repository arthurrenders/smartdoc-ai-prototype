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
  wrapInCard?: boolean
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

export function PropertyAddressCard({ propertyId, address, wrapInCard = true }: Props) {
  const candidateState = decodeGeocodeCandidatesState(address?.geocode_error ?? null)

  const geocodeOk = address?.geocode_status === "ok"
  const showCandidates = !geocodeOk && candidateState && candidateState.candidates.length > 0
  const showActionNeeded = !geocodeOk && !showCandidates

  const content = (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <MapPin className="h-4 w-4 text-brand-dark dark:text-brand-light" aria-hidden />
          Adres
        </h2>
        {address && (
          <EditPropertyAddressButton
            propertyId={propertyId}
            initialRawLine1={address.raw_line1}
            addressSource={address.source ?? ""}
          />
        )}
      </div>

      {!address ? (
        <p className="text-sm text-muted-foreground">Nog geen adres voor dit pand.</p>
      ) : (
        <div className="space-y-3 text-sm">
          {/* Primary address display */}
          <div>
            {hasStructuredFields(address) ? (
              <address className="not-italic leading-snug">
                {formatPropertyAddressLines(address).map((line, i) => (
                  <span key={`${i}-${line}`} className={`block ${i === 0 ? "text-base font-semibold text-foreground" : "text-sm text-muted-foreground"}`}>{line}</span>
                ))}
              </address>
            ) : address.normalized_full_address?.trim() ? (
              <p className="text-base font-semibold text-foreground">{address.normalized_full_address.trim()}</p>
            ) : (
              <p className="text-base font-semibold text-foreground">{address.raw_line1}</p>
            )}

            {geocodeOk && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Locatie bevestigd
              </p>
            )}
          </div>

          {/* Ambiguous candidates — functional flow, keep intact */}
          {showCandidates && (
            <div className="space-y-3 rounded-lg border border-brand-light/30 bg-brand-light/5 p-4">
              <p className="text-sm font-semibold text-brand-dark">
                {candidateState.kind === "ambiguous_candidates"
                  ? "Meerdere locaties gevonden. Kies de juiste."
                  : "Bedoelde u een van deze locaties?"}
              </p>
              <ul className="space-y-2">
                {candidateState.candidates.map((c, idx) => (
                  <li key={`${c.latitude}-${c.longitude}-${idx}`}>
                    <form
                      action={chooseGeocodeCandidate}
                      className="flex items-center justify-between gap-3 rounded-lg border border-brand-dark/10 bg-white p-3"
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
                        className="inline-flex whitespace-nowrap rounded-md bg-brand-dark px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0b3158]"
                      >
                        Gebruik
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Geocode action — only shown when location not yet confirmed */}
          {showActionNeeded && (
            <div>
              {address.geocode_error && !showCandidates && (
                <p className="mb-3 text-sm text-destructive" role="status">
                  {candidateState?.detail ?? address.geocode_error}
                </p>
              )}
              <GeocodePropertyAddressButton
                propertyId={propertyId}
                rawLine1={address.raw_line1}
              />
            </div>
          )}
        </div>
      )}
    </>
  )

  if (!wrapInCard) return content
  return <div className="saas-card">{content}</div>
}

