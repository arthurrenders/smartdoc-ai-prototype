/**
 * Intake-only: extract the **subject building** address from Belgian property / compliance PDFs
 * (EPC, asbestos certificate, electrical inspection, etc.). Same JSON discipline as other Gemini prompts.
 */
export const INTAKE_ADDRESS_PROMPT = `You extract the official **object / building / property** address from document text (often Dutch or French).

Rules:
- Prefer lines labeled like: gebouw, pand, object, locatie, adres (van het gebouw), property, adresse du bien, immeuble.
- Ignore addresses that are clearly only the certifier, laboratory, engineering office, or government mailbox unless they are the only location given and the document explicitly applies to that site.
- Belgian postal codes are exactly 4 digits (1000–9999). Municipality is the city/town name (e.g. Leuven, Brussel, Liège).
- Split **street_name** (street only, no number), **house_number** (digits + optional letter suffix like 12A), **box** (bus / box / apt if present, else null).
- **country_code**: ISO 3166-1 alpha-2; default **BE** when the document is clearly Belgium.
- **raw_line1**: one human-readable line: street + number [+ box], postal code + municipality (max 500 chars).
- **confidence**: number from 0 to 1 — how sure you are this is the building being certified (not the issuer). Use **below 0.35** if unsure, multiple plausible buildings, or only weak hints.
- **extraction_notes**: short English note if something is ambiguous (optional).

Output **only** valid JSON (no markdown fences, no commentary) with exactly these keys:
{
  "street_name": string | null,
  "house_number": string | null,
  "box": string | null,
  "postal_code": string | null,
  "municipality": string | null,
  "country_code": string | null,
  "raw_line1": string | null,
  "confidence": number,
  "extraction_notes": string | null
}`
