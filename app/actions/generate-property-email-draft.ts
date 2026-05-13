"use server"

import type {
  PropertyEmailDraftKind,
  PropertyEmailDraftLanguage,
} from "@/lib/property-email-drafts/types"
import {
  generateMissingDocsEmail,
  generateRedFlagsEmail,
  generateDocumentMismatchEmail,
  generateFollowUpEmail,
} from "@/lib/property-email-drafts"

export type GeneratePropertyEmailDraftResult =
  | { ok: true; draft: { subject: string; body: string } }
  | { ok: false; error: string }

const EMAIL_DRAFT_LANGUAGES = new Set<PropertyEmailDraftLanguage>(["en", "nl", "fr"])

export async function generatePropertyEmailDraft(
  propertyId: string,
  kind: PropertyEmailDraftKind,
  language: PropertyEmailDraftLanguage = "nl"
): Promise<GeneratePropertyEmailDraftResult> {
  if (!EMAIL_DRAFT_LANGUAGES.has(language)) {
    return { ok: false, error: "Invalid language." }
  }
  try {
    let draft: { subject: string; body: string }
    switch (kind) {
      case "missing_docs":
        draft = await generateMissingDocsEmail(propertyId, language)
        break
      case "red_flags":
        draft = await generateRedFlagsEmail(propertyId, language)
        break
      case "document_mismatch":
        draft = await generateDocumentMismatchEmail(propertyId, language)
        break
      case "follow_up":
        draft = await generateFollowUpEmail(propertyId, language)
        break
    }
    return { ok: true, draft }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not generate draft."
    return { ok: false, error: message }
  }
}
