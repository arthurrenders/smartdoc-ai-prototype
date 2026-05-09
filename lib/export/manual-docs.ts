/**
 * Static Dutch copy describing documents that SmartDoc cannot auto-analyze yet.
 * Shared by the readiness UI, the ZIP `ACTION_REQUIRED.txt` writer, and the
 * summary PDF — single source of truth.
 */

export type ManualDocInfo = {
  label: string
  shortReason: string
  longReason: string
}

const MANUAL_DOCS: Record<string, ManualDocInfo> = {
  SOIL_CERTIFICATE: {
    label: "Bodemattest",
    shortReason: "Wordt nog niet automatisch geanalyseerd door SmartDoc.",
    longReason:
      "Vereist door Vlaanderen (OVAM) bij verkoop van onroerend goed. Op te vragen via ovam.be of via de notaris. SmartDoc analyseert dit document nog niet automatisch — voeg het rechtstreeks toe op het portaal.",
  },
  URBAN_PLANNING_INFO: {
    label: "Stedenbouwkundige inlichtingen",
    shortReason: "Wordt nog niet automatisch geanalyseerd door SmartDoc.",
    longReason:
      "Vereist door de gemeente bij verkoop. Op te vragen bij de stadsdienst of via de notaris. SmartDoc analyseert dit document nog niet automatisch — voeg het rechtstreeks toe op het portaal.",
  },
  CADASTRAL_EXTRACT: {
    label: "Kadastraal uittreksel",
    shortReason: "Wordt nog niet automatisch geanalyseerd door SmartDoc.",
    longReason:
      "Op te vragen bij het Kadaster. SmartDoc analyseert dit document nog niet automatisch — voeg het rechtstreeks toe op het portaal of bij de notaris.",
  },
  OIL_TANK_CERTIFICATE: {
    label: "Keuring stookolietank",
    shortReason: "Wordt nog niet automatisch geanalyseerd door SmartDoc.",
    longReason:
      "Verplicht voor woningen met stookolieverwarming. Op te vragen bij een erkend technicus. SmartDoc analyseert dit document nog niet automatisch.",
  },
}

export function manualDocInfo(docType: string): ManualDocInfo {
  const upper = docType.toUpperCase()
  return (
    MANUAL_DOCS[upper] ?? {
      label: docType,
      shortReason: "Wordt nog niet automatisch geanalyseerd door SmartDoc.",
      longReason: "Voeg dit document handmatig toe op het portaal of bij de notaris.",
    }
  )
}

export function buildActionRequiredText(missingDocTypes: string[]): string {
  const lines: string[] = [
    "Te voegen documenten (handmatig)",
    "================================",
    "",
  ]
  for (const docType of missingDocTypes) {
    const info = manualDocInfo(docType)
    lines.push(`• ${info.label}`)
    lines.push(`  ${info.longReason}`)
    lines.push("")
  }
  lines.push("---")
  lines.push(
    "SmartDoc kon deze documenten niet automatisch valideren. Voeg ze rechtstreeks toe op het portaal (Zimmo / Immoweb / Realo) of bij de notaris voor compleetheid van het dossier.",
  )
  return lines.join("\n")
}
