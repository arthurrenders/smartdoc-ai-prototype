import "server-only"
import { getPropertyDetail, type PropertyDetailData } from "@/app/actions/get-property-detail"
import { formatPropertyFactsForEmailDraft } from "./context"
import { generatePropertyEmailDraftWithGemini } from "./llm-draft"
import type {
  PropertyEmailDraft,
  PropertyEmailDraftKind,
  PropertyEmailDraftLanguage,
} from "./types"

function isWrongDocumentFlag(data: PropertyDetailData): boolean {
  return data.flags.some(
    (f) =>
      f.title.toLowerCase().includes("wrong document type") ||
      f.details.toLowerCase().includes("wrong document")
  )
}

function concernFlags(data: PropertyDetailData) {
  return data.flags.filter((f) => f.severity === "red" || f.severity === "orange")
}

async function loadOrThrow(propertyId: string): Promise<PropertyDetailData> {
  const detail = await getPropertyDetail(propertyId)
  if (!detail) {
    throw new Error("Property not found or you do not have access.")
  }
  return detail
}

async function runKind(
  propertyId: string,
  kind: PropertyEmailDraftKind,
  language: PropertyEmailDraftLanguage = "nl"
) {
  const detail = await loadOrThrow(propertyId)
  const facts = formatPropertyFactsForEmailDraft(detail)
  return generatePropertyEmailDraftWithGemini(kind, facts, language)
}

/** Draft email requesting missing required documents. Requires at least one missing required type. */
export async function generateMissingDocsEmail(
  propertyId: string,
  language: PropertyEmailDraftLanguage = "nl"
): Promise<PropertyEmailDraft> {
  const detail = await loadOrThrow(propertyId)
  if (detail.missingRequiredDocumentNames.length === 0) {
    throw new Error("There are no missing required documents for this property.")
  }
  return generatePropertyEmailDraftWithGemini(
    "missing_docs",
    formatPropertyFactsForEmailDraft(detail),
    language
  )
}

/** Draft email about analysis flags (warnings / issues). Requires at least one non-green flag. */
export async function generateRedFlagsEmail(
  propertyId: string,
  language: PropertyEmailDraftLanguage = "nl"
): Promise<PropertyEmailDraft> {
  const detail = await loadOrThrow(propertyId)
  const concerns = concernFlags(detail)
  if (concerns.length === 0) {
    throw new Error("There are no compliance warnings or issues flagged for this property.")
  }
  return generatePropertyEmailDraftWithGemini("red_flags", formatPropertyFactsForEmailDraft(detail), language)
}

/** Draft email about possible wrong document type upload. Requires a wrong-document signal in flags. */
export async function generateDocumentMismatchEmail(
  propertyId: string,
  language: PropertyEmailDraftLanguage = "nl"
): Promise<PropertyEmailDraft> {
  const detail = await loadOrThrow(propertyId)
  if (!isWrongDocumentFlag(detail)) {
    throw new Error("No wrong-document-type or mismatch signal was found for this property.")
  }
  return generatePropertyEmailDraftWithGemini(
    "document_mismatch",
    formatPropertyFactsForEmailDraft(detail),
    language
  )
}

/** General follow-up combining suggested actions and status (always allowed if property exists). */
export async function generateFollowUpEmail(
  propertyId: string,
  language: PropertyEmailDraftLanguage = "nl"
): Promise<PropertyEmailDraft> {
  return runKind(propertyId, "follow_up", language)
}
