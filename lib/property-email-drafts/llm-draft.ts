import "server-only"
import { z } from "zod"
import { geminiClient, GEMINI_MODEL } from "@/lib/ai/gemini"
import type {
  PropertyEmailDraft,
  PropertyEmailDraftKind,
  PropertyEmailDraftLanguage,
} from "./types"

const EmailDraftSchema = z.object({
  subject: z.string().min(1).max(220),
  body: z.string().min(1).max(12000),
})

function languageInstruction(lang: PropertyEmailDraftLanguage): string {
  switch (lang) {
    case "nl":
      return `- Output language: write the entire subject and body in Dutch (Nederlands). PROPERTY_FACTS may be in English; translate the email naturally and keep document type labels accurate (you may keep well-known abbreviations such as EPC if common).`
    case "fr":
      return `- Output language: write the entire subject and body in French. PROPERTY_FACTS may be in English; translate the email naturally and keep document type labels accurate (you may keep well-known abbreviations such as EPC if common).`
    case "en":
      return `- Output language: write the entire subject and body in clear English.`
  }
}

function baseRules(lang: PropertyEmailDraftLanguage): string {
  return `You draft emails for professional real estate agents.

Rules:
- Use ONLY the facts under PROPERTY_FACTS. Do not invent documents, dates, legal outcomes, or property attributes not stated there.
- Tone: professional, practical, courteous. Address the recipient as "you" where appropriate; the agent is writing on their own behalf.
- Do not claim legal compliance, warranties, or that any authority has verified anything. Prefer phrasing like "based on our internal document review" or "please share".
- Do not threaten legal action. Offer clear, reasonable next steps.
${languageInstruction(lang)}
- Return ONLY valid JSON, no markdown fences, with exactly two string keys: "subject" and "body".`
}

function kindInstructions(kind: PropertyEmailDraftKind): string {
  switch (kind) {
    case "missing_docs":
      return `Task: Email to seller or owner requesting the missing required documents listed in PROPERTY_FACTS. Name each missing type explicitly. Keep it short and actionable.`
    case "red_flags":
      return `Task: Email summarizing compliance or risk items flagged in PROPERTY_FACTS (warnings/issues from analyses). Be factual and measured; suggest verification or specialist follow-up where appropriate. Do not dramatize.`
    case "document_mismatch":
      return `Task: Email explaining that a document may not match the expected type for this property slot (per PROPERTY_FACTS wrong-document / mismatch signals). Ask them to upload or send the correct certificate. Stay neutral — analysis may be wrong.`
    case "follow_up":
      return `Task: General polite follow-up referencing PROPERTY_FACTS and the suggested actions. Combine missing items, open items, and next steps in one coherent message without repeating the entire facts block verbatim.`
  }
}

function stripJsonFences(text: string): string {
  return text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim()
}

export async function generatePropertyEmailDraftWithGemini(
  kind: PropertyEmailDraftKind,
  factsBlock: string,
  language: PropertyEmailDraftLanguage = "en"
): Promise<PropertyEmailDraft> {
  const prompt = `${baseRules(language)}

${kindInstructions(kind)}

PROPERTY_FACTS:
${factsBlock}

Return JSON: {"subject":"...","body":"..."}`

  const response = await geminiClient.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
  })
  const content = response.text
  if (!content) {
    throw new Error("No content in email draft response")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonFences(content))
  } catch (e) {
    throw new Error(
      `Failed to parse email draft JSON: ${e instanceof Error ? e.message : "Unknown error"}`
    )
  }

  try {
    return EmailDraftSchema.parse(parsed)
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new Error(`Email draft validation failed: ${e.errors.map((x) => x.message).join("; ")}`)
    }
    throw e
  }
}
