import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/** Structured address (Belgium-first), shared by intake matching + match-or-create. */
export type NormalizedAddressFields = {
  street_name: string | null
  house_number: string | null
  box: string | null
  postal_code: string | null
  municipality: string | null
  country_code: string
}

/**
 * Unified property-address matching for intake (AI + manual).
 *
 * Assumptions: addresses are Belgium-first; street strings are short (Levenshtein is in-memory only);
 * `property_addresses` rows are the source of truth for matching (including rows with only `raw_line1`
 * populated — those often lack `street_name`/`house_number` and therefore contribute fewer matches).
 *
 * Strategy:
 * - Primary signal: normalized house number + street similarity (exact, punctuation-stripped, or fuzzy).
 * - Postal code and municipality increase confidence when present, but missing input fields do NOT block a match
 *   (avoids duplicate properties when the user or AI omits gemeente/postcode).
 * - Abbreviations (str./st./av./bd/rue…) are expanded to a canonical token form before comparison.
 * - Fuzzy tier uses normalized Levenshtein similarity on street strings (short strings only).
 * - Auto-link only a unique strong candidate, or a unique medium candidate above MEDIUM_AUTO_LINK_MIN_SIMILARITY.
 *   Two-or-more plausible candidates → ambiguous (manual review / user must disambiguate).
 */

/** Unique strong match → auto-link */
export const STRONG_STREET_SIMILARITY_MIN = 0.88
/** At least this similarity for "strong" tier when postal+municipality agree */
export const STRONG_STREET_SIMILARITY_POSTAL_BONUS = 0.82
/** Medium tier floor (still needs unique best + high bar to auto-link) */
export const MEDIUM_STREET_SIMILARITY_MIN = 0.72
/** Single medium candidate must clear this bar to auto-link (uncertain → manual review below this) */
export const MEDIUM_AUTO_LINK_MIN_SIMILARITY = 0.84

export type DbAddressRow = {
  id: string
  property_id: string
  street_name: string | null
  house_number: string | null
  box: string | null
  postal_code: string | null
  municipality: string | null
  country_code: string | null
  /** Free-form line from create flow / manual intake — used when structured fields are empty. */
  raw_line1: string | null
}

export type AddressMatchTier = "strong" | "medium"

export type UniquePropertyAddressMatch =
  | { kind: "linked"; row: DbAddressRow; tier: AddressMatchTier; streetSimilarity: number }
  | { kind: "ambiguous"; strongCount: number; mediumCount: number }
  | { kind: "none" }
  | { kind: "insufficient_input" }

export function normStr(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function normHouse(s: string | null | undefined): string {
  return normStr(s).replace(/\s/g, "")
}

function stripPunct(s: string | null | undefined): string {
  return normStr(s).replace(/[^a-z0-9]/g, "")
}

/** Expand common BE/NL street abbreviations so "Kerkstr." ≈ "Kerkstraat". */
export function canonicalStreetForm(s: string | null | undefined): string {
  let t = normStr(s)
  if (!t) return ""
  const abbrevs: [RegExp, string][] = [
    [/\bstr\.?\b/g, "straat"],
    [/\bst\.?\b/g, "sint"],
    [/\bdr\.?\b/g, "dokter"],
    [/\bprof\.?\b/g, "professor"],
    [/\bav\.?\b/g, "avenue"],
    [/\bave\.?\b/g, "avenue"],
    [/\bbd\.?\b/g, "boulevard"],
    [/\bboul\.?\b/g, "boulevard"],
    [/\bpl\.?\b/g, "place"],
    [/\bch\.?\b/g, "chaussee"],
    [/\bchaussee\b/g, "chaussee"],
    [/\br\.?\b(?=\s)/g, "rue"],
    [/\brue\b/g, "rue"],
    [/\bln\.?\b/g, "laan"],
    [/\bweg\b/g, "weg"],
  ]
  for (const [re, rep] of abbrevs) {
    t = t.replace(re, rep)
  }
  return normStr(t.replace(/\s+/g, " "))
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const row = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) row[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost)
      prev = tmp
    }
  }
  return row[n]!
}

/** 0–1 similarity; 1 = identical. Only for short street names (performance). */
export function streetSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const ca = canonicalStreetForm(a)
  const cb = canonicalStreetForm(b)
  if (!ca && !cb) return 1
  if (!ca || !cb) return 0
  if (ca === cb) return 1
  const fa = stripPunct(ca)
  const fb = stripPunct(cb)
  if (fa && fb && fa === fb) return 0.98
  if (fa.length > 80 || fb.length > 80) return fa === fb ? 1 : 0
  const d = levenshtein(fa, fb)
  const denom = Math.max(fa.length, fb.length, 1)
  return Math.max(0, 1 - d / denom)
}

function municipalityClose(a: string | null, b: string | null): boolean {
  const na = normStr(a)
  const nb = normStr(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true
  return false
}

function boxCompatible(extracted: string | null, db: string | null): boolean {
  const e = normStr(extracted)
  const d = normStr(db)
  if (!e) return true
  if (!d) return true
  return e === d
}

function hasValidBePostal(p: string | null | undefined): boolean {
  const x = p?.trim()
  return Boolean(x && /^[1-9]\d{3}$/.test(x))
}

/**
 * Best-effort parse of a free-form line (manual input or display name) into structured fields.
 * Does not require a unique PDF-style hit (unlike extractBelgianAddressFromPdfText).
 */
export function parsePartialAddressFromText(text: string): NormalizedAddressFields | null {
  const raw = text.trim().replace(/\s+/g, " ")
  if (!raw) return null

  const segments = raw
    .split(/\n|,|;|\||\//)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)

  for (const line of segments) {
    const m = line.match(/^(.+?)\s+([1-9]\d{3})\s+([A-Za-zÀ-ÿ0-9](?:[A-Za-zÀ-ÿ0-9\s\-'.]+[A-Za-zÀ-ÿ0-9])?)$/i)
    if (m) {
      const streetPart = m[1].trim().replace(/\s+/g, " ")
      const postal = m[2]
      const municipality = m[3].trim().replace(/\s+/g, " ")
      let street_name: string | null = null
      let house_number: string | null = null
      let box: string | null = null
      const busM = streetPart.match(/^(.+?)\s+bus\s+([A-Za-z0-9]+)$/i)
      if (busM) {
        const front = busM[1].trim()
        box = busM[2].trim()
        const numM = front.match(/^(.+?)\s+(\d+[A-Za-z]?)$/i)
        if (numM) {
          street_name = numM[1].trim() || null
          house_number = numM[2].trim()
        } else {
          street_name = front || null
        }
      } else {
        const numM = streetPart.match(/^(.+?)\s+(\d+[A-Za-z]?)$/i)
        if (numM) {
          street_name = numM[1].trim() || null
          house_number = numM[2].trim()
        } else {
          street_name = streetPart || null
        }
      }
      return {
        street_name,
        house_number,
        box,
        postal_code: postal,
        municipality,
        country_code: "BE",
      }
    }
  }

  const tail = segments[segments.length - 1] ?? raw
  const noPostal = tail.match(/^(.+?)\s+(\d+[A-Za-z]?)$/i)
  if (noPostal) {
    return {
      street_name: noPostal[1].trim() || null,
      house_number: noPostal[2].trim(),
      box: null,
      postal_code: null,
      municipality: null,
      country_code: "BE",
    }
  }

  return null
}

async function fetchOwnerPropertyIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("properties").select("id").eq("user_id", userId)
  if (error) {
    console.error("[intake] findMatchingProperty: list properties failed", error.message)
    return []
  }
  return (data ?? []).map((r) => r.id as string)
}

/** All addresses for the owner — postal is not used as a DB filter so partial input can still match. */
export async function fetchAllPropertyAddressesForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<DbAddressRow[]> {
  const propertyIds = await fetchOwnerPropertyIds(supabase, userId)
  if (!propertyIds.length) return []

  const { data, error } = await supabase
    .from("property_addresses")
    .select(
      "id, property_id, street_name, house_number, box, postal_code, municipality, country_code, raw_line1"
    )
    .in("property_id", propertyIds)

  if (error) {
    console.error("[intake] findMatchingProperty: load property_addresses failed", error.message)
    return []
  }
  return (data as DbAddressRow[]) ?? []
}

function postalMatchesWhenPresent(
  inputPostal: string | null,
  rowPostal: string | null
): { ok: boolean; strict: boolean } {
  const inHas = hasValidBePostal(inputPostal)
  const rowHas = hasValidBePostal(rowPostal)
  if (!inHas) {
    return { ok: true, strict: false }
  }
  if (!rowHas) {
    return { ok: false, strict: true }
  }
  return { ok: normStr(inputPostal) === normStr(rowPostal), strict: true }
}

function municipalityMatchesWhenPresent(inputMun: string | null, rowMun: string | null): boolean {
  if (!normStr(inputMun)) return true
  return municipalityClose(inputMun, rowMun)
}

/**
 * Score all DB rows against structured input; bucket strong/medium, then require uniqueness for auto-link.
 */
export function findUniquePropertyAddressMatch(
  input: NormalizedAddressFields,
  rows: DbAddressRow[]
): UniquePropertyAddressMatch {
  if (!normStr(input.street_name) || !normHouse(input.house_number)) {
    return { kind: "insufficient_input" }
  }

  type Scored = { row: DbAddressRow; tier: AddressMatchTier; sim: number }
  const strong: Scored[] = []
  const medium: Scored[] = []

  for (const row of rows) {
    if (!normHouse(row.house_number)) continue
    if (normHouse(input.house_number) !== normHouse(row.house_number)) continue
    if (!boxCompatible(input.box, row.box)) continue

    const { ok: postalOk } = postalMatchesWhenPresent(input.postal_code, row.postal_code)
    if (!postalOk) continue

    const sim = streetSimilarity(input.street_name, row.street_name)
    const muniOk = municipalityMatchesWhenPresent(input.municipality, row.municipality)

    const hasPostal = hasValidBePostal(input.postal_code) && hasValidBePostal(row.postal_code)
    const strongSimThreshold = hasPostal && muniOk ? STRONG_STREET_SIMILARITY_POSTAL_BONUS : STRONG_STREET_SIMILARITY_MIN

    if (sim >= strongSimThreshold && muniOk) {
      strong.push({ row, tier: "strong", sim })
      continue
    }
    if (sim >= MEDIUM_STREET_SIMILARITY_MIN && muniOk) {
      medium.push({ row, tier: "medium", sim })
    }
  }

  if (strong.length > 1) {
    return { kind: "ambiguous", strongCount: strong.length, mediumCount: medium.length }
  }
  if (strong.length === 1) {
    const s = strong[0]!
    return { kind: "linked", row: s.row, tier: "strong", streetSimilarity: s.sim }
  }

  const mediumAuto = medium.filter((m) => m.sim >= MEDIUM_AUTO_LINK_MIN_SIMILARITY)
  if (mediumAuto.length > 1) {
    return { kind: "ambiguous", strongCount: 0, mediumCount: mediumAuto.length }
  }
  if (mediumAuto.length === 1) {
    const s = mediumAuto[0]!
    return { kind: "linked", row: s.row, tier: "medium", streetSimilarity: s.sim }
  }

  // Remaining medium candidates are too weak to auto-link alone, or there are several — manual review.
  if (medium.length >= 1) {
    return { kind: "ambiguous", strongCount: 0, mediumCount: medium.length }
  }

  return { kind: "none" }
}

/**
 * When structured parse misses (e.g. missing postcode in DB and user input) but `property_addresses.raw_line1`
 * holds a recognizable line, compare the user's combined text to that line with the same street similarity helper.
 * Conservative: needs a clear best score and no close runner-up (avoids wrong merges).
 */
export function findUniqueRawLineTextMatch(
  combinedSearchText: string,
  rows: DbAddressRow[]
): UniquePropertyAddressMatch {
  const needle = normStr(combinedSearchText)
  if (needle.length < 4) {
    return { kind: "insufficient_input" }
  }

  type Scored = { row: DbAddressRow; sim: number }
  const scored: Scored[] = []
  for (const row of rows) {
    const raw = row.raw_line1?.trim()
    if (!raw || normStr(raw).length < 6) continue
    const sim = streetSimilarity(combinedSearchText, raw)
    if (sim >= MEDIUM_STREET_SIMILARITY_MIN) {
      scored.push({ row, sim })
    }
  }
  if (!scored.length) {
    return { kind: "none" }
  }
  scored.sort((a, b) => b.sim - a.sim)
  const best = scored[0]!
  if (best.sim < MEDIUM_AUTO_LINK_MIN_SIMILARITY) {
    return { kind: "none" }
  }
  const runners = scored.filter((s) => s.sim >= best.sim - 0.06 && s.sim >= MEDIUM_AUTO_LINK_MIN_SIMILARITY - 0.02)
  if (runners.length > 1) {
    return {
      kind: "ambiguous",
      strongCount: runners.filter((s) => s.sim >= STRONG_STREET_SIMILARITY_MIN).length,
      mediumCount: runners.length,
    }
  }
  const tier: AddressMatchTier = best.sim >= STRONG_STREET_SIMILARITY_MIN ? "strong" : "medium"
  return { kind: "linked", row: best.row, tier, streetSimilarity: best.sim }
}

/** Public alias — same implementation as `findUniquePropertyAddressMatch`. */
export const findMatchingPropertyForAddress = findUniquePropertyAddressMatch

export function scoreForMatchTier(tier: AddressMatchTier): number {
  return tier === "strong" ? 0.92 : 0.78
}

/**
 * Server-side safeguard: immediately before creating a property, re-query addresses and re-run matching
 * so concurrent uploads or stale in-memory state cannot create a duplicate.
 */
export async function assertNoConflictingPropertyAddressMatch(
  supabase: SupabaseClient,
  userId: string,
  input: NormalizedAddressFields
): Promise<UniquePropertyAddressMatch> {
  const rows = await fetchAllPropertyAddressesForUser(supabase, userId)
  return findUniquePropertyAddressMatch(input, rows)
}
