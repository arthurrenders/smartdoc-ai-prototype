import "server-only"

/**
 * Extract concatenated text from @google/genai generateContent responses when `response.text` is empty.
 */
export function getTextFromGeminiResponse(response: unknown): string | null {
  if (!response || typeof response !== "object") return null
  const r = response as Record<string, unknown>

  const direct = r.text
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim()
  }

  const candidates = r.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  const first = candidates[0] as Record<string, unknown> | undefined
  const content = first?.content as Record<string, unknown> | undefined
  const parts = content?.parts
  if (!Array.isArray(parts)) return null

  const chunks: string[] = []
  for (const p of parts) {
    if (p && typeof p === "object" && "text" in p) {
      const t = (p as { text?: unknown }).text
      if (typeof t === "string" && t) chunks.push(t)
    }
  }
  const joined = chunks.join("").trim()
  return joined || null
}

function stripJsonFences(raw: string): string {
  return raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim()
}

/**
 * Parse model output that should be JSON; tolerate markdown fences and leading/trailing prose.
 */
export function parseJsonFromModelOutput(content: string): unknown | null {
  const cleaned = stripJsonFences(content)
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf("{")
    const end = cleaned.lastIndexOf("}")
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

export function assertParseableJsonFromModelOutput(content: string): void {
  if (parseJsonFromModelOutput(content) === null) {
    throw new Error("Model returned invalid JSON")
  }
}
