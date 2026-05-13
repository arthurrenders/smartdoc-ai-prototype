import type { ExtractedPropertyAddress } from "@/lib/property-address/types"

export type Flag = {
  severity: "red" | "orange" | "green"
  title: string
  details: string
}

export type AnalysisResult = {
  status: "red" | "orange" | "green"
  summary: string
  flags: Flag[]
  confidence?: number
  /** When set by analyzers / extractors, used to sync property_addresses after a successful run. */
  property_address?: ExtractedPropertyAddress
  // EPC-specific fields (optional, only present for EPC documents)
  epc_score_letter?: string | null
  energy_consumption_kwh_m2_year?: number | null
  certificate_date?: string | null
  inspection_date?: string | null
  expiry_date?: string | null
  is_expired?: boolean | null
  // Property-metadata fields (optional, used to sync property columns after a successful run).
  // construction_year is also set by the asbestos analyzer.
  construction_year?: number | null
  heating_type?: string | null
  dwelling_type?: string | null
  living_area_m2?: number | null
  bedrooms?: number | null
}

// Calculate confidence based on rule-based detection results
export function calculateConfidence(result: AnalysisResult, text: string): number {
  // High confidence if we found specific patterns
  if (result.flags.length > 0) {
    return 0.9 // High confidence when flags are found
  }

  // Medium confidence if summary is specific and detailed
  if (
    result.summary.length > 50 &&
    !result.summary.includes("reviewed - no issues") &&
    !result.summary.includes("geen problemen")
  ) {
    return 0.7
  }

  // Low confidence if summary is generic or empty
  if (
    result.summary.length < 20 ||
    result.summary.includes("reviewed - no issues") ||
    result.summary.includes("geen problemen")
  ) {
    return 0.3
  }

  return 0.5 // Default medium confidence
}

export function analyzeElectrical(text: string): AnalysisResult {
  const normalizedText = text.toLowerCase()
  const flags: Flag[] = []

  // Check for "niet conform" (not compliant)
  if (normalizedText.includes("niet conform")) {
    flags.push({
      severity: "red",
      title: "Elektrische installatie niet conform",
      details: "Het document vermeldt dat de elektrische installatie niet conform is.",
    })
    return {
      status: "red",
      summary: "Kritiek: elektrische installatie niet conform",
      flags,
    }
  }

  return {
    status: "green",
    summary: "Elektrische installatie lijkt conform",
    flags: [],
  }
}

export function analyzeEPC(text: string): AnalysisResult {
  const normalizedText = text.toLowerCase()
  const flags: Flag[] = []

  // Try to detect explicit expiry date phrases like:
  // "geldig tot", "geldig tot en met", "valid until"
  const expiryMatch = text.match(
    /(geldig tot(?: en met)?|valid until)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i
  )

  if (expiryMatch) {
    const day = parseInt(expiryMatch[2], 10)
    const monthName = expiryMatch[3].toLowerCase()
    const year = parseInt(expiryMatch[4], 10)

    const monthMap: Record<string, number> = {
      januari: 0,
      january: 0,
      februari: 1,
      february: 1,
      maart: 2,
      march: 2,
      april: 3,
      mei: 4,
      may: 4,
      juni: 5,
      june: 5,
      juli: 6,
      july: 6,
      augustus: 7,
      august: 7,
      september: 8,
      oktober: 9,
      october: 9,
      november: 10,
      december: 11,
    }

    const monthIndex = monthMap[monthName]
    if (monthIndex !== undefined) {
      const expiryDate = new Date(year, monthIndex, day)
      const today = new Date()

      if (expiryDate.getTime() < today.setHours(0, 0, 0, 0)) {
        flags.push({
          severity: "red",
          title: "EPC-attest verlopen",
          details: "De geldigheidsdatum van het EPC-attest is verstreken.",
        })
        return {
          status: "red",
          summary: "EPC-attest is verlopen",
          flags,
        }
      }
    }
  }

  // Try to detect EPC class (A, B, C, D, E, F, G)
  const epcClassMatch = text.match(/\b(?:energielabel|epc|energy[-\s]?class)[\s:]*([a-g])\b/i)
  const epcClass = epcClassMatch ? epcClassMatch[1].toUpperCase() : null

  // Try to detect numeric score (typically 0-300 or similar)
  const scoreMatch = text.match(/(?:energie[-\s]?index|epc[-\s]?score|score)[\s:]*(\d+)/i)
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null

  if (epcClass) {
    if (epcClass === "F" || epcClass === "G") {
      flags.push({
        severity: "red",
        title: `Zwakke energieprestatie (klasse ${epcClass})`,
        details: `EPC-klasse ${epcClass} wijst op een zeer zwakke energieprestatie. Verbetering is dringend aanbevolen.`,
      })
      return {
        status: "red",
        summary: `Zwakke EPC-score: klasse ${epcClass}`,
        flags,
      }
    } else if (epcClass === "E" || epcClass === "D") {
      flags.push({
        severity: "orange",
        title: `Matige energieprestatie (klasse ${epcClass})`,
        details: `EPC-klasse ${epcClass} wijst op een matige energieprestatie. Overweeg verbeteringen.`,
      })
      return {
        status: "orange",
        summary: `Matige EPC-score: klasse ${epcClass}`,
        flags,
      }
    } else {
      return {
        status: "green",
        summary: `Goede EPC-score: klasse ${epcClass}`,
        flags: [],
      }
    }
  }

  // If numeric score found, evaluate it
  // Typical EPC scores: A (0-50), B (51-90), C (91-150), D (151-230), E (231-330), F (331-450), G (450+)
  if (score !== null) {
    if (score >= 331) {
      flags.push({
        severity: "red",
        title: `Zwakke energieprestatie (score: ${score})`,
        details: `EPC-score ${score} wijst op een zeer zwakke energieprestatie (klasse F of G). Verbetering is dringend aanbevolen.`,
      })
      return {
        status: "red",
        summary: `Zwakke EPC-score: ${score}`,
        flags,
      }
    } else if (score >= 231) {
      flags.push({
        severity: "orange",
        title: `Matige energieprestatie (score: ${score})`,
        details: `EPC-score ${score} wijst op een matige energieprestatie (klasse E). Overweeg verbeteringen.`,
      })
      return {
        status: "orange",
        summary: `Matige EPC-score: ${score}`,
        flags,
      }
    } else {
      return {
        status: "green",
        summary: `Goede EPC-score: ${score}`,
        flags: [],
      }
    }
  }

  // If no EPC class or score detected, default to green
  return {
    status: "green",
    summary: "EPC-attest nagekeken - geen problemen gevonden",
    flags: [],
  }
}

export function analyzeAsbestos(text: string): AnalysisResult {
  const normalizedText = text.toLowerCase()
  const flags: Flag[] = []

  // Only trigger high-risk when the document explicitly indicates elevated risk.
  // Mere mention of "asbest" or "asbestos" is normal in asbestos certificates and should NOT flag.
  const highRiskPhrases = [
    "niet-asbestveilig",
    "niet asbestveilig",
    "verhoogd risico",
    "high risk",
    "high-risk",
    "elevated risk",
    "gevaarlijk",
    "dangerous",
    "kankerverwekkend",
    "carcinogenic",
    "verwijdering verplicht",
    "removal required",
    "ernstig risico",
    "serious risk",
    "acute blootstelling",
    "acute exposure",
    "hazardous",
    "immediate remediation",
  ]

  const foundPhrases: string[] = []
  for (const phrase of highRiskPhrases) {
    if (normalizedText.includes(phrase)) {
      foundPhrases.push(phrase)
    }
  }

  if (foundPhrases.length > 0) {
    flags.push({
      severity: "red",
      title: "Verhoogd asbestrisico gedetecteerd",
      details: `Het document vermeldt verhoogd asbestrisico: ${foundPhrases.join(", ")}. Professionele beoordeling is nodig.`,
    })
    return {
      status: "red",
      summary: "Kritiek: verhoogd asbestrisico gedetecteerd",
      flags,
    }
  }

  return {
    status: "green",
    summary: "Asbestdocument nagekeken - geen hoogrisico-indicatoren gevonden",
    flags: [],
  }
}

