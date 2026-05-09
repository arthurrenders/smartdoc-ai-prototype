const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function matchPropertyIdFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const parts = pathname.split("/").filter(Boolean)
  const idx = parts.indexOf("properties")
  if (idx === -1 || idx + 1 >= parts.length) return null
  const candidate = parts[idx + 1]
  return UUID_RE.test(candidate) ? candidate : null
}
