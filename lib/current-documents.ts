/**
 * Helpers to select the current document per required document type.
 * The current document is always the latest upload for that property + type.
 * The legacy `is_active` column may still exist for compatibility, but it no
 * longer decides which document powers status, summaries, exports, or dates.
 */

export type DocumentWithTimestamp = {
  id?: string | null
  document_type_id: string | null
  created_at?: string | null
  is_active?: boolean | null
  [key: string]: unknown
}

/**
 * Returns one document per document_type_id: the one with the latest created_at.
 * Use this so status and flags are not polluted by older uploads of the same type.
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
    if (!existing) {
      byType.set(typeId, doc)
      continue
    }
    if (docTime > existingTime) {
      byType.set(typeId, doc)
      continue
    }
    if (docTime === existingTime && String(doc.id ?? "") > String(existing.id ?? "")) {
      byType.set(typeId, doc)
    }
  }
  return Array.from(byType.values())
}
