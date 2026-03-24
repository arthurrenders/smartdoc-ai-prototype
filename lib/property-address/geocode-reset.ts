/** Shared DB patch when address text changes — user edit or new extraction. */

export function geocodeResetPatch(now: string) {
  return {
    geocode_status: "pending" as const,
    geocode_error: null as string | null,
    latitude: null as number | null,
    longitude: null as number | null,
    geocoded_at: null as string | null,
    normalized_full_address: null as string | null,
    street_name: null as string | null,
    house_number: null as string | null,
    box: null as string | null,
    postal_code: null as string | null,
    municipality: null as string | null,
    region: null as string | null,
    updated_at: now,
  }
}
