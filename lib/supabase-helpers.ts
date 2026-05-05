export function pickName<T extends { display_name?: string | null }>(
  row: T | T[] | null | undefined
): string | null {
  if (!row) return null
  const one = Array.isArray(row) ? row[0] : row
  return one?.display_name ?? null
}

export function pickDocTypeName(
  doc:
    | { document_types?: { name?: string } | { name?: string }[] | null }
    | { document_types?: { name?: string } | { name?: string }[] | null }[]
    | null
    | undefined
): string | null {
  if (!doc) return null
  const one = Array.isArray(doc) ? doc[0] : doc
  if (!one?.document_types) return null
  const dt = one.document_types
  const t = Array.isArray(dt) ? dt[0] : dt
  return t?.name ?? null
}
