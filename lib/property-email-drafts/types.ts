export type PropertyEmailDraftLanguage = "en" | "nl" | "fr"

export type PropertyEmailDraftKind =
  | "missing_docs"
  | "red_flags"
  | "document_mismatch"
  | "follow_up"

export type PropertyEmailDraft = {
  subject: string
  body: string
}
