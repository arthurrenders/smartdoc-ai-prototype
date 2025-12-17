type Flag = {
  severity: "red" | "orange" | "green"
  title: string
  details: string
}

type AnalysisResult = {
  status: "red" | "orange" | "green"
  summary: string
  flags: Flag[]
  confidence?: number
}

// Calculate confidence based on rule-based detection results
export function calculateConfidence(result: AnalysisResult, text: string): number {
  // High confidence if we found specific patterns
  if (result.flags.length > 0) {
    return 0.9 // High confidence when flags are found
  }

  // Medium confidence if summary is specific and detailed
  if (result.summary.length > 50 && !result.summary.includes("reviewed - no issues")) {
    return 0.7
  }

  // Low confidence if summary is generic or empty
  if (result.summary.length < 20 || result.summary.includes("reviewed - no issues")) {
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
      title: "Non-Compliant Electrical Installation",
      details: "Document indicates non-compliance with electrical standards ('niet conform' detected).",
    })
    return {
      status: "red",
      summary: "Critical: Non-compliant electrical installation detected",
      flags,
    }
  }

  return {
    status: "green",
    summary: "Electrical installation appears compliant",
    flags: [],
  }
}

export function analyzeEPC(text: string): AnalysisResult {
  const normalizedText = text.toLowerCase()
  const flags: Flag[] = []

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
        title: `Poor Energy Performance (Class ${epcClass})`,
        details: `EPC class ${epcClass} indicates very poor energy performance. Immediate improvement recommended.`,
      })
      return {
        status: "red",
        summary: `Poor EPC rating: Class ${epcClass}`,
        flags,
      }
    } else if (epcClass === "E" || epcClass === "D") {
      flags.push({
        severity: "orange",
        title: `Moderate Energy Performance (Class ${epcClass})`,
        details: `EPC class ${epcClass} indicates moderate energy performance. Consider improvements.`,
      })
      return {
        status: "orange",
        summary: `Moderate EPC rating: Class ${epcClass}`,
        flags,
      }
    } else {
      return {
        status: "green",
        summary: `Good EPC rating: Class ${epcClass}`,
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
        title: `Poor Energy Performance (Score: ${score})`,
        details: `EPC score of ${score} indicates very poor energy performance (Class F or G). Immediate improvement recommended.`,
      })
      return {
        status: "red",
        summary: `Poor EPC score: ${score}`,
        flags,
      }
    } else if (score >= 231) {
      flags.push({
        severity: "orange",
        title: `Moderate Energy Performance (Score: ${score})`,
        details: `EPC score of ${score} indicates moderate energy performance (Class E). Consider improvements.`,
      })
      return {
        status: "orange",
        summary: `Moderate EPC score: ${score}`,
        flags,
      }
    } else {
      return {
        status: "green",
        summary: `Good EPC score: ${score}`,
        flags: [],
      }
    }
  }

  // If no EPC class or score detected, default to green
  return {
    status: "green",
    summary: "EPC document reviewed - no issues detected",
    flags: [],
  }
}

export function analyzeAsbestos(text: string): AnalysisResult {
  const normalizedText = text.toLowerCase()
  const flags: Flag[] = []

  // High-risk phrases for asbestos
  const highRiskPhrases = [
    "asbest",
    "asbestos",
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
      title: "High-Risk Asbestos Content Detected",
      details: `Document contains high-risk asbestos-related phrases: ${foundPhrases.join(", ")}. Immediate professional assessment required.`,
    })
    return {
      status: "red",
      summary: "Critical: High-risk asbestos content detected",
      flags,
    }
  }

  return {
    status: "green",
    summary: "Asbestos document reviewed - no high-risk indicators found",
    flags: [],
  }
}

