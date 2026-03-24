/**
 * Pick the newest analysis run by created_at (desc), then id for stability.
 * Prefer ordering embedded runs in the query; this stays as a safe fallback.
 */
export function pickLatestAnalysisRun<T extends { created_at?: string | null; id?: string }>(
  runs: T[] | null | undefined
): T | null {
  if (!runs?.length) return null
  return [...runs].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    if (tb !== ta) return tb - ta
    return String(b.id ?? "").localeCompare(String(a.id ?? ""))
  })[0]
}
