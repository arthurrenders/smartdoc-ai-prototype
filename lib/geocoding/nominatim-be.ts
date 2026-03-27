/**
 * Belgium-first forward geocoding via OpenStreetMap Nominatim (free, no API key).
 * Respect usage policy: identify via User-Agent, avoid bulk / high QPS.
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */

export type NominatimSuccess = {
  kind: "ok"
  latitude: number
  longitude: number
  normalizedFullAddress: string
  streetName: string | null
  houseNumber: string | null
  postalCode: string | null
  municipality: string | null
  region: string | null
}

export type NominatimFailure =
  | { kind: "no_result" }
  | { kind: "ambiguous"; detail: string }
  | {
      kind: "ambiguous_candidates"
      detail: string
      query: string
      candidates: NominatimCandidate[]
    }
  | {
      kind: "did_you_mean"
      detail: string
      query: string
      candidates: NominatimCandidate[]
    }
  | { kind: "http_error"; detail: string }
  | { kind: "invalid_response"; detail: string }

export type NominatimGeocodeOutcome = NominatimSuccess | NominatimFailure

export type StructuredBelgianAddress = {
  streetName: string | null
  houseNumber: string | null
  box?: string | null
  postalCode: string | null
  municipality: string | null
  countryCode?: string | null
}

type NominatimFeature = {
  lat: string
  lon: string
  display_name?: string
  importance?: number
  place_rank?: number
  address?: Record<string, string | undefined>
}

export type NominatimCandidate = {
  latitude: number
  longitude: number
  displayName: string
  streetName: string | null
  houseNumber: string | null
  postalCode: string | null
  municipality: string | null
  region: string | null
  countryCode: string | null
  score: number
}

function pickMunicipality(addr: Record<string, string | undefined> | undefined): string | null {
  if (!addr) return null
  const v =
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.hamlet ||
    null
  return v?.trim() || null
}

function pickRegion(addr: Record<string, string | undefined> | undefined): string | null {
  if (!addr) return null
  const v = addr.state || addr.region || null
  return v?.trim() || null
}

function locationKey(lat: string, lon: string): string {
  return `${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`
}

function normLoose(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeQuery(rawLine: string): string {
  // Keep useful components (street, number, postcode, city) while flattening noisy line breaks.
  return rawLine
    .replace(/[\r\n]+/g, ", ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
}

function safePart(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const v = value.replace(/\s+/g, " ").trim()
  return v.length > 0 ? v : null
}

function compactPunctuation(value: string): string {
  return value
    .replace(/[\r\n]+/g, ", ")
    .replace(/[;|/]+/g, ", ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildStreetLine(parts: StructuredBelgianAddress): string | null {
  const street = safePart(parts.streetName)
  const num = safePart(parts.houseNumber)
  const box = safePart(parts.box)
  if (!street) return null
  const tokens = [street, num, box ? `bus ${box}` : null].filter(Boolean)
  return tokens.length > 0 ? tokens.join(" ") : null
}

function parseStreetAndHouseNumber(raw: string): {
  streetName: string | null
  houseNumber: string | null
  box: string | null
} {
  const input = compactPunctuation(raw)
  const beforeComma = input.split(",")[0]?.trim() ?? input
  const streetLine = beforeComma.replace(/\b(Belgium|België)\b/gi, "").trim()
  const m = streetLine.match(
    /^(?<street>.*?)(?:\s+)(?<house>\d+[a-zA-Z]?)(?:\s*(?:bus|boite|box)\s*(?<box>[a-zA-Z0-9-]+))?\s*$/i
  )
  if (m?.groups) {
    return {
      streetName: safePart(m.groups.street ?? null),
      houseNumber: safePart(m.groups.house ?? null),
      box: safePart(m.groups.box ?? null),
    }
  }
  return {
    streetName: safePart(streetLine),
    houseNumber: null,
    box: null,
  }
}

function inferStructuredFromRaw(raw: string): Partial<StructuredBelgianAddress> {
  const normalized = compactPunctuation(normalizeQuery(raw))
  const postcode = normalized.match(/\b(1[0-9]{3}|[2-9][0-9]{3})\b/)?.[1] ?? null
  const tokens = normalized
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
  const parsedStreet = parseStreetAndHouseNumber(normalized)
  let municipality: string | null = null
  const pcCity = normalized.match(
    /\b(?:1[0-9]{3}|[2-9][0-9]{3})\s+([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,})\b/
  )
  if (pcCity?.[1]) {
    municipality = safePart(pcCity[1])
  } else if (tokens.length > 1) {
    municipality = safePart(tokens[tokens.length - 1])
  } else {
    const muniLead = normalized.match(
      /^([A-Za-zÀ-ÖØ-öø-ÿ' -]{2,})\s+(?:1[0-9]{3}|[2-9][0-9]{3})\b/
    )
    municipality = safePart(muniLead?.[1] ?? null)
  }

  let cleanedStreet = parsedStreet.streetName ?? ""
  if (postcode) {
    cleanedStreet = cleanedStreet.replace(
      new RegExp(`\\b${escapeRegex(postcode)}\\b`, "gi"),
      " "
    )
  }
  if (municipality) {
    cleanedStreet = cleanedStreet.replace(
      new RegExp(`\\b${escapeRegex(municipality)}\\b`, "gi"),
      " "
    )
  }
  cleanedStreet = cleanedStreet.replace(/\s+/g, " ").trim()

  return {
    streetName: safePart(cleanedStreet) ?? parsedStreet.streetName ?? null,
    houseNumber: parsedStreet.houseNumber ?? null,
    box: parsedStreet.box ?? null,
    postalCode: postcode,
    municipality: municipality || null,
    countryCode: "BE",
  }
}

function buildNominatimSearchParams(
  rawLine: string,
  structured?: StructuredBelgianAddress | null
): { mode: "structured" | "raw"; params: URLSearchParams; normalizedQuery: string } {
  const normalizedQuery = normalizeQuery(rawLine)
  const s = structured ?? null
  const inferred = inferStructuredFromRaw(rawLine)
  const merged: StructuredBelgianAddress = {
    streetName:
      safePart(s?.streetName ?? null) ??
      safePart(inferred.streetName ?? null) ??
      null,
    houseNumber:
      safePart(s?.houseNumber ?? null) ??
      safePart(inferred.houseNumber ?? null),
    box: safePart(s?.box ?? null) ?? safePart(inferred.box ?? null),
    postalCode:
      safePart(s?.postalCode ?? null) ??
      safePart(inferred.postalCode ?? null),
    municipality:
      safePart(s?.municipality ?? null) ??
      safePart(inferred.municipality ?? null),
    countryCode: safePart(s?.countryCode ?? null) ?? "BE",
  }

  const streetLine = buildStreetLine(merged)
  const canStructured = Boolean(
    (streetLine && (merged.postalCode || merged.municipality)) ||
      (merged.postalCode && merged.municipality) ||
      (streetLine && merged.houseNumber)
  )

  const base = new URLSearchParams({
    format: "json",
    limit: "8",
    countrycodes: "be",
    addressdetails: "1",
  })

  if (canStructured) {
    if (streetLine) base.set("street", streetLine)
    if (merged.postalCode) base.set("postalcode", merged.postalCode)
    if (merged.municipality) base.set("city", merged.municipality)
    base.set("country", "Belgium")
    return { mode: "structured", params: base, normalizedQuery }
  }

  base.set("q", `${normalizedQuery}, Belgium`)
  return { mode: "raw", params: base, normalizedQuery }
}

function extractQueryHints(query: string): {
  postcode: string | null
  houseNumber: string | null
  municipality: string | null
  roadHint: string
} {
  const compact = query.replace(/\s+/g, " ").trim()
  const postcodeMatch = compact.match(/\b(\d{4})\b/)
  const houseNumberMatch = compact.match(/\b(\d+[a-zA-Z]?)\b/)
  const parts = compact
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)

  const municipality = parts.length >= 2 ? parts[parts.length - 1] : null
  return {
    postcode: postcodeMatch?.[1] ?? null,
    houseNumber: houseNumberMatch?.[1] ?? null,
    municipality,
    roadHint: parts[0] ?? compact,
  }
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normLoose(a).split(" ").filter(Boolean))
  const tb = new Set(normLoose(b).split(" ").filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  let overlap = 0
  for (const t of ta) {
    if (tb.has(t)) overlap += 1
  }
  return overlap / Math.max(ta.size, tb.size)
}

function scoreCandidate(
  feature: NominatimFeature,
  queryHints: ReturnType<typeof extractQueryHints>,
  normalizedQuery: string
): { candidate: NominatimCandidate; rejectReason: string | null } {
  const lat = Number(feature.lat)
  const lon = Number(feature.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return {
      candidate: {
        latitude: NaN,
        longitude: NaN,
        displayName: feature.display_name?.trim() || "",
        streetName: null,
        houseNumber: null,
        postalCode: null,
        municipality: null,
        region: null,
        countryCode: null,
        score: -1,
      },
      rejectReason: "invalid_coordinates",
    }
  }

  const addr = feature.address
  const streetName = addr?.road?.trim() || null
  const houseNumber = addr?.house_number?.trim() || null
  const postalCode = addr?.postcode?.trim() || null
  const municipality = pickMunicipality(addr)
  const region = pickRegion(addr)
  const countryCode = addr?.country_code?.trim()?.toLowerCase() || null

  let score = 0
  if (countryCode === "be") score += 60
  if (queryHints.postcode && postalCode === queryHints.postcode) score += 25
  if (
    queryHints.houseNumber &&
    houseNumber &&
    normLoose(queryHints.houseNumber) === normLoose(houseNumber)
  ) {
    score += 15
  }
  if (queryHints.municipality && municipality) {
    const exact = normLoose(queryHints.municipality) === normLoose(municipality)
    const loose = normLoose(queryHints.municipality).includes(normLoose(municipality))
    if (exact) score += 12
    else if (loose) score += 7
  }
  const roadSim = tokenSimilarity(queryHints.roadHint, streetName ?? feature.display_name ?? "")
  if (roadSim >= 0.75) score += 15
  else if (roadSim >= 0.45) score += 8

  const display = feature.display_name?.trim() || normalizedQuery
  if (normLoose(display).includes(normLoose(normalizedQuery))) score += 8
  if (typeof feature.importance === "number" && Number.isFinite(feature.importance)) {
    score += Math.round(feature.importance * 10)
  }

  const candidate: NominatimCandidate = {
    latitude: lat,
    longitude: lon,
    displayName: display,
    streetName,
    houseNumber,
    postalCode,
    municipality,
    region,
    countryCode,
    score,
  }

  if (countryCode !== null && countryCode !== "be" && score < 20) {
    return { candidate, rejectReason: "non_belgian_low_score" }
  }

  return { candidate, rejectReason: null }
}

/**
 * Query Nominatim with Belgium restriction. Deduplicates same coordinates; multiple distinct
 * locations → ambiguous (no automatic pick).
 */
export async function geocodeBelgiumRawLine(
  rawLine: string,
  userAgent: string,
  structured?: StructuredBelgianAddress | null
): Promise<NominatimGeocodeOutcome> {
  console.info("[SmartDoc][nominatim] input", { rawLine })
  const q = normalizeQuery(rawLine)
  if (!q) {
    return { kind: "invalid_response", detail: "Empty query" }
  }

  const firstAttempt = buildNominatimSearchParams(rawLine, structured)
  const attempts: Array<{
    mode: "structured" | "raw"
    params: URLSearchParams
    normalizedQuery: string
  }> = [firstAttempt]
  if (firstAttempt.mode === "structured") {
    const fallbackRaw = new URLSearchParams({
      format: "json",
      limit: "8",
      countrycodes: "be",
      addressdetails: "1",
      q: `${firstAttempt.normalizedQuery}, Belgium`,
    })
    attempts.push({
      mode: "raw",
      params: fallbackRaw,
      normalizedQuery: firstAttempt.normalizedQuery,
    })
  }

  let features: NominatimFeature[] = []
  let normalizedQuery = firstAttempt.normalizedQuery
  for (const attempt of attempts) {
    normalizedQuery = attempt.normalizedQuery
    const url = `https://nominatim.openstreetmap.org/search?${attempt.params.toString()}`
    console.info("[SmartDoc][nominatim] request", {
      mode: attempt.mode,
      normalizedQuery: attempt.normalizedQuery,
      url,
      params: Object.fromEntries(attempt.params.entries()),
    })

    let res: Response
    try {
      res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      return {
        kind: "http_error",
        detail: e instanceof Error ? e.message : "Network error",
      }
    }

    if (!res.ok) {
      return { kind: "http_error", detail: `HTTP ${res.status}` }
    }

    let data: unknown
    try {
      data = await res.json()
    } catch {
      return { kind: "invalid_response", detail: "Invalid JSON" }
    }
    if (!Array.isArray(data)) {
      return { kind: "invalid_response", detail: "Unexpected Nominatim response shape" }
    }

    const found = data as NominatimFeature[]
    console.info("[SmartDoc][nominatim] response", {
      mode: attempt.mode,
      count: found.length,
    })
    if (found.length > 0) {
      features = found
      break
    }
  }

  if (features.length === 0) {
    return { kind: "no_result" }
  }
  const queryHints = extractQueryHints(q)
  const seen = new Set<string>()
  const scoredUnique: NominatimCandidate[] = []
  for (const f of features) {
    if (typeof f.lat !== "string" || typeof f.lon !== "string") continue
    const k = locationKey(f.lat, f.lon)
    if (seen.has(k)) continue
    seen.add(k)
    const { candidate, rejectReason } = scoreCandidate(f, queryHints, q)
    if (!rejectReason) {
      scoredUnique.push(candidate)
      console.info("[SmartDoc][nominatim] candidate accepted", {
        displayName: candidate.displayName,
        score: candidate.score,
        postalCode: candidate.postalCode,
        municipality: candidate.municipality,
        countryCode: candidate.countryCode,
      })
    } else {
      console.info("[SmartDoc][nominatim] candidate rejected", {
        displayName: f.display_name ?? null,
        reason: rejectReason,
      })
    }
  }

  if (scoredUnique.length === 0) {
    return { kind: "no_result" }
  }

  scoredUnique.sort((a, b) => b.score - a.score)
  const top = scoredUnique[0]
  const second = scoredUnique[1]

  // If the top hit is clearly stronger, accept directly instead of forcing ambiguity.
  if (!second || (top.score >= 40 && top.score - second.score >= 20)) {
    return {
      kind: "ok",
      latitude: top.latitude,
      longitude: top.longitude,
      normalizedFullAddress: top.displayName,
      streetName: top.streetName,
      houseNumber: top.houseNumber,
      postalCode: top.postalCode,
      municipality: top.municipality,
      region: top.region,
    }
  }

  const plausible = scoredUnique.filter((c) => c.score >= 25).slice(0, 5)
  if (plausible.length >= 2 && plausible.length <= 5) {
    return {
      kind: "ambiguous_candidates",
      query: q,
      detail: `${plausible.length} plausibele locaties gevonden; kies de juiste match.`,
      candidates: plausible,
    }
  }

  const suggestions = scoredUnique.filter((c) => c.score >= 10).slice(0, 5)
  if (suggestions.length > 0) {
    return {
      kind: "did_you_mean",
      query: q,
      detail: "Geen exacte match gevonden, maar we hebben wel vergelijkbare locaties.",
      candidates: suggestions,
    }
  }

  if (scoredUnique.length > 1) {
    return {
      kind: "ambiguous",
      detail: `${scoredUnique.length} verschillende locaties; verfijn het adres.`,
    }
  }
  const hit = scoredUnique[0]

  return {
    kind: "ok",
    latitude: hit.latitude,
    longitude: hit.longitude,
    normalizedFullAddress: hit.displayName,
    streetName: hit.streetName,
    houseNumber: hit.houseNumber,
    postalCode: hit.postalCode,
    municipality: hit.municipality,
    region: hit.region,
  }
}
