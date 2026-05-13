import type { AnalysisResult } from "@/lib/analysis/detectors"

const PROPERTY_TYPE_VALUES = new Set(["house", "apartment", "land", "commercial", "other"] as const)

type PropertyType = "house" | "apartment" | "land" | "commercial" | "other"

type PropertyTypeCandidate = {
  value: PropertyType
  score: number
}

function normalizeLooseText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\u00b2/g, "2")
    .replace(/m\u00c2\u00b2/gi, "m2")
    .replace(/[ \t]+/g, " ")
    .trim()
}

function parseLooseNumber(raw: string): number | null {
  const compact = raw.replace(/\s+/g, "")
  const decimal =
    compact.includes(",") && compact.includes(".")
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(",", ".")
  const n = Number(decimal)
  return Number.isFinite(n) ? n : null
}

function validArea(raw: string): number | null {
  const n = parseLooseNumber(raw)
  if (n === null || n <= 0 || n >= 100_000) return null
  return n
}

function validConstructionYear(year: number): number | null {
  if (!Number.isFinite(year)) return null
  const rounded = Math.round(year)
  return rounded >= 1700 && rounded <= 2100 ? rounded : null
}

function extractLivingAreaM2(normalized: string): number | null {
  const areaUnit = "(?:m2|m\\^2|vierkante meter)"
  const labelPatterns: Array<{ re: RegExp; score: number }> = [
    {
      re: new RegExp(
        "\\b(?:bewoonbare oppervlakte|woonoppervlakte|woon oppervlakte|netto vloeroppervlakte|bruto vloeroppervlakte|bruikbare vloeroppervlakte|nuttige vloeroppervlakte)\\b[^\\n\\r]{0,80}?(\\d{1,5}(?:[,.]\\d+)?)\\s*" +
          areaUnit,
        "gi",
      ),
      score: 100,
    },
    {
      re: new RegExp(
        "\\b(?:vloeroppervlakte|oppervlakte)\\s+(?:van\\s+)?(?:het\\s+)?(?:pand|gebouw|woning|wooneenheid|appartement|handelspand)\\b[^\\n\\r]{0,80}?(\\d{1,5}(?:[,.]\\d+)?)\\s*" +
          areaUnit,
        "gi",
      ),
      score: 80,
    },
    {
      re: new RegExp(
        "\\b(?:bebouwde oppervlakte|grondoppervlakte gebouw|oppervlakte bebouwing)\\b[^\\n\\r]{0,80}?(\\d{1,5}(?:[,.]\\d+)?)\\s*" +
          areaUnit,
        "gi",
      ),
      score: 55,
    },
    {
      re: new RegExp(
        "(\\d{1,5}(?:[,.]\\d+)?)\\s*" +
          areaUnit +
          "[^\\n\\r]{0,80}\\b(?:bewoonbare oppervlakte|woonoppervlakte|netto vloeroppervlakte|bruto vloeroppervlakte|bruikbare vloeroppervlakte)\\b",
        "gi",
      ),
      score: 95,
    },
  ]

  let best: { value: number; score: number } | null = null
  for (const { re, score } of labelPatterns) {
    for (const match of normalized.matchAll(re)) {
      const value = validArea(match[1])
      if (value === null) continue
      const context = match[0]
      if (/\b(?:perceel|kadastra|kadaster|terrein|grondoppervlakte|lot|tuin)\b/.test(context)) {
        continue
      }
      if (!best || score > best.score) {
        best = { value, score }
      }
    }
  }

  return best?.value ?? null
}

function extractConstructionYear(normalized: string): number | null {
  const patterns = [
    /\b(?:bouwjaar|jaar van bouw|jaar\s+bouw|constructiejaar|oprichtingsjaar|jaar van oprichting|gebouwd in|opgericht in|bouwperiode)\b[^\n\r]{0,80}?\b((?:17|18|19|20)\d{2})\b/gi,
    /\b(?:datum oprichting|datum van oprichting|datum gebouw|eerste ingebruikname|ingebruikname)\b[^\n\r]{0,80}?\b((?:17|18|19|20)\d{2})\b/gi,
  ]

  for (const re of patterns) {
    for (const match of normalized.matchAll(re)) {
      const year = validConstructionYear(Number.parseInt(match[1], 10))
      if (year !== null) return year
    }
  }

  return null
}

function classifyPropertyType(fragment: string): PropertyTypeCandidate | null {
  if (/\b(?:appartement|flat|studio|duplex|meergezinswoning|serviceflat|assistentiewoning)\b/.test(fragment)) {
    return { value: "apartment", score: 90 }
  }
  if (/\b(?:handelspand|handelsruimte|commercieel|kantoor|winkel|horeca|magazijn|bedrijfspand|industrieel)\b/.test(fragment)) {
    return { value: "commercial", score: 90 }
  }
  if (/\b(?:bouwgrond|landbouwgrond|perceel grond|onbebouwde grond|grond)\b/.test(fragment)) {
    return { value: "land", score: 80 }
  }
  if (
    /\b(?:eengezinswoning|woonhuis|rijwoning|halfopen bebouwing|open bebouwing|gesloten bebouwing|villa|bungalow|hoeve)\b/.test(
      fragment,
    )
  ) {
    return { value: "house", score: 90 }
  }
  if (/\b(?:woning|huis)\b/.test(fragment)) {
    return { value: "house", score: 55 }
  }
  return null
}

function extractPropertyType(normalized: string): PropertyType | null {
  const labelPattern =
    /\b(?:pandtype|type\s+(?:pand|gebouw|woning|goed|vastgoed)|gebouwtype|woningtype|aard\s+(?:van\s+)?(?:het\s+)?(?:goed|gebouw|woning|pand)|bestemming\s+(?:gebouw|pand|goed)|functie\s+(?:gebouw|pand|goed)|gebruik\s+(?:gebouw|pand|goed)|omschrijving\s+(?:van\s+)?(?:het\s+)?(?:goed|gebouw|pand))\b\s*[:.-]?\s*([^\n\r]{0,140})/gi

  let best: PropertyTypeCandidate | null = null
  for (const match of normalized.matchAll(labelPattern)) {
    const candidate = classifyPropertyType(match[1])
    if (candidate && (!best || candidate.score > best.score)) {
      best = candidate
    }
  }

  if (best) return best.value

  const fallbackCandidates = [
    classifyPropertyType(normalized.match(/\b(?:appartement|flat|studio|duplex|meergezinswoning)\b/)?.[0] ?? ""),
    classifyPropertyType(normalized.match(/\b(?:handelspand|handelsruimte|kantoor|winkel|bedrijfspand)\b/)?.[0] ?? ""),
    classifyPropertyType(normalized.match(/\b(?:eengezinswoning|woonhuis|rijwoning|villa|bungalow)\b/)?.[0] ?? ""),
    classifyPropertyType(normalized.match(/\b(?:bouwgrond|landbouwgrond|onbebouwde grond)\b/)?.[0] ?? ""),
  ].filter((c): c is PropertyTypeCandidate => Boolean(c))

  fallbackCandidates.sort((a, b) => b.score - a.score)
  return fallbackCandidates[0]?.value ?? null
}

/**
 * Rule-based extraction for stedenbouwkundige inlichtingen / vastgoedinformatie.
 * These documents are treated as the authoritative source for basic property
 * metadata that belongs to the property itself rather than to a certificate.
 */
export function extractUrbanPlanningMetadata(text: string): Partial<AnalysisResult> {
  const normalized = normalizeLooseText(text)
  const out: Partial<AnalysisResult> = {}

  const constructionYear = extractConstructionYear(normalized)
  if (constructionYear !== null) {
    out.construction_year = constructionYear
  }

  const propertyType = extractPropertyType(normalized)
  if (propertyType && PROPERTY_TYPE_VALUES.has(propertyType)) {
    out.dwelling_type = propertyType
  }

  const livingAreaM2 = extractLivingAreaM2(normalized)
  if (livingAreaM2 !== null) {
    out.living_area_m2 = livingAreaM2
  }

  return out
}

export function hasUrbanPlanningMetadata(result: Partial<AnalysisResult>): boolean {
  return (
    result.construction_year != null ||
    result.dwelling_type != null ||
    result.living_area_m2 != null
  )
}
