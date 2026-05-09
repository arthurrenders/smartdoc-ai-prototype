import "server-only"
import JSZip from "jszip"
import type { Destination, PropertyExportContext, ReadinessResult } from "../types"
import { createServerClient } from "@/lib/supabase/server"
import { classifyDocument, friendlyFilename } from "../doc-classification"
import { buildDestinationPayload } from "../adapters"
import { buildCanonicalCsv, buildCanonicalJson, buildDescriptionTxt } from "./property-data"
import { collectPhotos } from "./photos"
import { buildSummaryPdf } from "./summary-pdf"
import { buildActionRequiredText } from "../manual-docs"

export async function buildExportZip(args: {
  ctx: PropertyExportContext
  destination: Destination
  readiness: ReadinessResult
}): Promise<Buffer> {
  const { ctx, destination, readiness } = args
  const supabase = createServerClient()
  const zip = new JSZip()

  // /01_property_data
  const dataFolder = zip.folder("01_property_data")!
  dataFolder.file("property_data.json", buildCanonicalJson(ctx))
  dataFolder.file("property_data.csv", buildCanonicalCsv(ctx))
  const adapterPayload = buildDestinationPayload(destination, ctx)
  dataFolder.file(adapterPayload.filename, adapterPayload.body)

  // /02_public_listing and /04_legal_documents — fetch document blobs
  const publicFolder = zip.folder("02_public_listing")!
  const legalFolder = zip.folder("04_legal_documents")!
  publicFolder.file("description.txt", buildDescriptionTxt(ctx))

  let docIndex = 0
  for (const doc of ctx.documents) {
    docIndex += 1
    const bucket = classifyDocument(doc.document_type_name)
    if (bucket === "photo") continue // handled in /03_photos
    const target = bucket === "public" ? publicFolder : legalFolder
    const filename = friendlyFilename(doc.document_type_name, doc.storage_path, docIndex)
    try {
      const { data, error } = await supabase.storage.from("documents").download(doc.storage_path)
      if (error || !data) continue
      const buf = Buffer.from(await data.arrayBuffer())
      target.file(filename, buf)
    } catch {
      // Skip un-downloadable docs; readiness already flagged anything required.
    }
  }

  // Manual-required docs that the realtor still needs to add at the platform.
  const manualMissing = readiness.items
    .filter((it) => it.manual && it.severity !== "ok" && it.key.startsWith("doc:"))
    .map((it) => it.key.slice("doc:".length))
  if (manualMissing.length > 0) {
    legalFolder.file("ACTION_REQUIRED.txt", buildActionRequiredText(manualMissing))
  }

  // /03_photos
  const photosFolder = zip.folder("03_photos")!
  const photos = await collectPhotos(ctx)
  for (const p of photos) {
    photosFolder.file(p.filename, p.body)
  }

  // /05_report
  const reportFolder = zip.folder("05_report")!
  const summary = await buildSummaryPdf(ctx, destination, readiness)
  reportFolder.file("export_summary.pdf", summary)

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } })
}
