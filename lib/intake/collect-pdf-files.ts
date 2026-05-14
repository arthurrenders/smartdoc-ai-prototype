/**
 * Walk drag-and-drop FileSystemEntry trees (folders) and collect PDFs.
 * Returns stable relative paths for optional persistence on intake rows.
 */

export type PdfFileWithPath = {
  file: File
  /** Path relative to dropped root (uses "/" separators), e.g. "Invoices/2024/epc.pdf" */
  relativePath: string
}

const PDF_MIME = "application/pdf"

/** Chrome returns directory entries in batches of at most ~100; loop until empty. */
async function readAllDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const out: FileSystemEntry[] = []
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
    if (batch.length === 0) break
    out.push(...batch)
  }
  return out
}

function isPdfFile(file: File): boolean {
  return file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf")
}

type WalkLimits = { maxFiles: number; maxDepth: number; depth: number }

async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  acc: PdfFileWithPath[],
  limits: WalkLimits,
  onSkipNonPdf: () => void
): Promise<void> {
  if (acc.length >= limits.maxFiles) return

  if (entry.isFile) {
    const fe = entry as FileSystemFileEntry
    const file = await new Promise<File>((resolve, reject) => {
      fe.file(resolve, reject)
    })
    if (!isPdfFile(file)) {
      onSkipNonPdf()
      return
    }
    const rel = `${prefix}${file.name}`.replace(/\\/g, "/")
    acc.push({ file, relativePath: rel })
    return
  }

  if (!entry.isDirectory) return
  if (limits.depth >= limits.maxDepth) return

  const dir = entry as FileSystemDirectoryEntry
  const nextPrefix = `${prefix}${dir.name}/`
  const reader = dir.createReader()
  const children = await readAllDirectoryEntries(reader)
  limits.depth += 1
  try {
    for (const child of children) {
      if (acc.length >= limits.maxFiles) break
      await walkEntry(child, nextPrefix, acc, limits, onSkipNonPdf)
    }
  } finally {
    limits.depth -= 1
  }
}

export type CollectPdfStats = {
  pdfCount: number
  skippedNonPdf: number
}

const defaultLimits = (): WalkLimits => ({
  maxFiles: 500,
  maxDepth: 32,
  depth: 0,
})

/**
 * Recursively collect PDFs from a DataTransfer (mixed files + folders).
 */
export async function collectPdfFilesFromDataTransfer(dt: DataTransfer): Promise<{
  files: PdfFileWithPath[]
  stats: CollectPdfStats
}> {
  const items = dt.items
  let skippedNonPdf = 0
  const acc: PdfFileWithPath[] = []
  const limits = defaultLimits()
  const onSkip = () => {
    skippedNonPdf += 1
  }

  // Snapshot synchronously: DataTransferItemList entries become invalid after the
  // first await, so a single dropped file is all that would survive an in-loop await.
  type Snap = { entry: FileSystemEntry | null; file: File | null }
  const snapshot: Snap[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item || item.kind !== "file") continue
    const entry = typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null
    const file = entry ? null : item.getAsFile()
    snapshot.push({ entry, file })
  }

  for (const snap of snapshot) {
    if (snap.entry) {
      await walkEntry(snap.entry, "", acc, limits, onSkip)
      continue
    }
    const f = snap.file
    if (!f) continue
    if (!isPdfFile(f)) {
      skippedNonPdf += 1
      continue
    }
    const rel = (f.webkitRelativePath && f.webkitRelativePath.length > 0
      ? f.webkitRelativePath
      : f.name
    ).replace(/\\/g, "/")
    acc.push({ file: f, relativePath: rel })
  }

  const seen = new Set<string>()
  const deduped: PdfFileWithPath[] = []
  for (const row of acc) {
    const key = `${row.relativePath}\0${row.file.size}\0${row.file.lastModified}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(row)
  }

  return {
    files: deduped,
    stats: {
      pdfCount: deduped.length,
      skippedNonPdf,
    },
  }
}

/**
 * Deduplicate file rows before upload (multi-select or folder input).
 */
export function dedupePdfInputs(rows: PdfFileWithPath[]): PdfFileWithPath[] {
  const seen = new Set<string>()
  const out: PdfFileWithPath[] = []
  for (const row of rows) {
    const key = `${row.relativePath}\0${row.file.size}\0${row.file.lastModified}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}
