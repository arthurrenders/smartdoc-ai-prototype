/**
 * Helpers to select the current/active document per required document type.
 * Used so property status, summaries, and flags are based only on the latest
 * document per type (not historical or replaced uploads).
 */

export type DocumentWithTimestamp = {
  document_type_id: string | null
  created_at?: string | null
  [key: string]: unknown
}

/**
 * Returns one document per document_type_id: the one with the latest created_at.
 * Use this to get "current active documents" so that status and flags are not
 * polluted by older uploads of the same type.
 */
export function getCurrentDocumentsByType<T extends DocumentWithTimestamp>(
  documents: T[]
): T[] {
  const byType = new Map<string, T>()
  for (const doc of documents) {
    const typeId = doc.document_type_id
    if (!typeId) continue
    const existing = byType.get(typeId)
    const docTime = doc.created_at ? new Date(doc.created_at).getTime() : 0
    const existingTime = existing?.created_at ? new Date(existing.created_at).getTime() : 0
    if (!existing || docTime > existingTime) {
      byType.set(typeId, doc)
    }
  }
  return Array.from(byType.values())
}
