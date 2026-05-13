import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import type { PropertyExportContext, ReadinessResult, Destination } from "../types"
import { manualDocInfo } from "../manual-docs"

const TITLE = "Smart Export — Auditrapport"

export async function buildSummaryPdf(
  ctx: PropertyExportContext,
  destination: Destination,
  readiness: ReadinessResult,
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842]) // A4 portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const margin = 50
  let y = 800
  const lineHeight = 16

  function draw(text: string, options?: { font?: typeof font; size?: number; color?: ReturnType<typeof rgb> }) {
    page.drawText(text, {
      x: margin,
      y,
      size: options?.size ?? 11,
      font: options?.font ?? font,
      color: options?.color ?? rgb(0.1, 0.1, 0.15),
    })
    y -= lineHeight
  }

  function rule() {
    page.drawLine({
      start: { x: margin, y: y + 8 },
      end: { x: 545, y: y + 8 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.85),
    })
    y -= 8
  }

  draw(TITLE, { font: bold, size: 18, color: rgb(0.05, 0.23, 0.42) })
  y -= 6
  draw(`Bestemming: ${destination.name} (${destination.output_format.toUpperCase()})`, { font: bold, size: 11 })
  draw(`Pand: ${ctx.property.display_name ?? ctx.property.id}`)
  if (ctx.address?.normalized_full_address) {
    draw(`Adres: ${ctx.address.normalized_full_address}`)
  }
  draw(`Gegenereerd: ${new Date().toISOString()}`)
  rule()

  draw(`Geschiktheidsscore: ${readiness.score}%`, { font: bold, size: 14 })
  draw(readiness.canExport ? "Status: GEREED voor export" : "Status: BLOKKERS aanwezig")
  rule()

  draw("Auditresultaten", { font: bold, size: 13 })
  for (const item of readiness.items) {
    if (y < 80) {
      const next = pdf.addPage([595, 842])
      // pdf-lib pages are independent, so we have to reassign
      // for simplicity we just stop at one page overflow.
      void next
      break
    }
    const marker =
      item.severity === "ok" ? "[OK]      " : item.severity === "warning" ? "[WAARSCH] " : "[BLOKKER] "
    const color =
      item.severity === "ok"
        ? rgb(0.1, 0.5, 0.2)
        : item.severity === "warning"
        ? rgb(0.85, 0.55, 0.0)
        : rgb(0.78, 0.15, 0.15)
    draw(`${marker}${item.label}${item.reason ? ` — ${item.reason}` : ""}`, { color })
  }

  // Manual to-do section
  const manualMissing = readiness.items.filter(
    (it) => it.manual && it.severity !== "ok" && it.key.startsWith("doc:"),
  )
  if (manualMissing.length > 0 && y > 100) {
    rule()
    draw("Manueel toe te voegen", { font: bold, size: 13, color: rgb(0.7, 0.45, 0.0) })
    draw(
      "Deze documenten ontbreken in het exportpakket of moeten rechtstreeks op het portaal worden toegevoegd.",
      { color: rgb(0.4, 0.4, 0.4), size: 9 },
    )
    for (const item of manualMissing) {
      if (y < 80) break
      const docType = item.key.slice("doc:".length)
      const info = manualDocInfo(docType)
      draw(`• ${info.label}`, { color: rgb(0.7, 0.45, 0.0) })
    }
  }

  rule()
  draw("Documenten in dossier", { font: bold, size: 13 })
  if (ctx.documents.length === 0) {
    draw("(geen documenten)")
  } else {
    for (const d of ctx.documents) {
      if (y < 80) break
      draw(`• ${d.document_type_name ?? "Onbekend"} — status ${d.status}`)
    }
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}
