/**
 * Static Dutch copy describing documents that may still need to be supplied
 * directly to an export destination or notary.
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
    shortReason: "Nodig voor verkoopdossiers; upload in SmartDoc en voeg toe aan het portaal indien gevraagd.",
    longReason:
      "Vereist door Vlaanderen (OVAM) bij verkoop van onroerend goed. Op te vragen via ovam.be of via de notaris. Upload het in SmartDoc voor analyse en voeg het rechtstreeks toe op het portaal wanneer de bestemming daarom vraagt.",
  },
  URBAN_PLANNING_INFO: {
    label: "Stedenbouwkundige inlichtingen",
    shortReason: "Nodig voor verkoopdossiers; upload in SmartDoc en voeg toe aan het portaal indien gevraagd.",
    longReason:
      "Vereist door de gemeente bij verkoop. Op te vragen bij de stadsdienst of via de notaris. Upload het in SmartDoc voor analyse en voeg het rechtstreeks toe op het portaal wanneer de bestemming daarom vraagt.",
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
    "Deze documenten ontbreken in het exportpakket of moeten nog rechtstreeks op het portaal (Zimmo / Immoweb / Realo) of bij de notaris worden toegevoegd.",
  )
  return lines.join("\n")
}
