import type {
  Destination,
  PropertyExportContext,
  ReadinessItem,
  ReadinessResult,
} from "../types"
import { evaluateConditional, dutchFieldLabel } from "./rules"

const DOC_DUTCH_LABELS: Record<string, string> = {
  EPC: "EPC-attest",
  ASBESTOS: "Asbestattest",
  ELECTRICAL: "Elektrische keuring",
  SOIL_CERTIFICATE: "Bodemattest",
  CADASTRAL_EXTRACT: "Kadastraal uittreksel",
  URBAN_PLANNING_INFO: "Stedenbouwkundige inlichtingen",
  OIL_TANK_CERTIFICATE: "Keuring stookolietank",
  PHOTO: "Foto",
  FLOOR_PLAN: "Plattegrond",
}

const FIELD_DUTCH_LABELS: Record<string, string> = {
  address: "Adres",
  asking_price: "Vraagprijs",
  property_type: "Pandtype",
  bedrooms: "Slaapkamers",
  living_area_m2: "Bewoonbare oppervlakte",
  description: "Omschrijving",
}

function docLabel(name: string): string {
  return DOC_DUTCH_LABELS[name] ?? name
}

function fieldLabel(name: string): string {
  return FIELD_DUTCH_LABELS[name] ?? dutchFieldLabel(name)
}

/**
 * Returns true when the property has at least one usable document of the given type.
 * "Usable" means the document is not in error status.
 */
function hasDocument(ctx: PropertyExportContext, typeName: string): boolean {
  return ctx.documents.some(
    (d) => d.document_type_name?.toUpperCase() === typeName.toUpperCase() && d.status !== "error",
  )
}

/**
 * For PHOTO specifically: in v1 we satisfy this requirement with the satellite
 * snapshot already attached to every property when geocoded. So PHOTO is
 * "ok" if the property has either an uploaded PHOTO document OR address
 * coordinates that let StreetViewImage produce a Mapbox satellite tile.
 */
function hasPhoto(ctx: PropertyExportContext): boolean {
  if (hasDocument(ctx, "PHOTO")) return true
  const a = ctx.address
  if (!a) return false
  if (a.latitude !== null && a.longitude !== null) return true
  if (a.normalized_full_address || a.raw_line1) return true
  return false
}

function hasAddress(ctx: PropertyExportContext): boolean {
  const a = ctx.address
  if (!a) return false
  return Boolean(
    (a.street_name && a.postal_code) ||
      a.normalized_full_address ||
      a.raw_line1,
  )
}

function fieldPresent(ctx: PropertyExportContext, fieldName: string): boolean {
  if (fieldName === "address") return hasAddress(ctx)
  const value = (ctx.property as unknown as Record<string, unknown>)[fieldName]
  if (value === null || value === undefined) return false
  if (typeof value === "string" && value.trim() === "") return false
  return true
}

export function evaluateReadiness(
  destination: Destination,
  ctx: PropertyExportContext,
): ReadinessResult {
  const rules = destination.validation_rules
  const items: ReadinessItem[] = []
  const requiredDocs = new Set<string>()
  const manualDocs = new Set<string>()
  const docReason = new Map<string, string>()

  // Base required docs
  for (const d of rules.required_documents ?? []) requiredDocs.add(d)
  for (const d of rules.global_required_documents ?? []) requiredDocs.add(d)
  for (const d of rules.manual_required_documents ?? []) manualDocs.add(d)

  // Conditional rules — graceful degradation: indeterminate emits a Warning,
  // not a Blocker, but we still surface the implied docs so the realtor knows.
  const indeterminate: { docs: string[]; reason: string }[] = []
  for (const rule of rules.conditional ?? []) {
    const evaluation = evaluateConditional(rule, ctx.property)
    if (evaluation.kind === "fired") {
      for (const doc of evaluation.impliedDocs) {
        requiredDocs.add(doc)
        if (evaluation.reason) docReason.set(doc, evaluation.reason)
      }
      for (const doc of evaluation.impliedManualDocs) {
        manualDocs.add(doc)
        if (evaluation.reason) docReason.set(doc, evaluation.reason)
      }
    } else if (evaluation.kind === "indeterminate") {
      indeterminate.push({
        docs: [...evaluation.impliedDocs, ...evaluation.impliedManualDocs],
        reason: evaluation.reason,
      })
    }
  }

  // Required fields
  for (const field of rules.required_fields ?? []) {
    if (fieldPresent(ctx, field)) {
      items.push({ key: `field:${field}`, label: fieldLabel(field), severity: "ok" })
    } else {
      items.push({
        key: `field:${field}`,
        label: fieldLabel(field),
        severity: "blocker",
        reason: "Verplicht veld ontbreekt",
      })
    }
  }

  // If a doc landed in both sets, the hard-required treatment wins.
  for (const doc of requiredDocs) manualDocs.delete(doc)

  // Required docs
  for (const docType of requiredDocs) {
    const hit = docType === "PHOTO" ? hasPhoto(ctx) : hasDocument(ctx, docType)
    items.push({
      key: `doc:${docType}`,
      label: docLabel(docType),
      severity: hit ? "ok" : "blocker",
      reason: hit ? undefined : docReason.get(docType) ?? "Document ontbreekt",
    })
  }

  // Manual-required docs (warning when missing, never blocker).
  for (const docType of manualDocs) {
    const hit = docType === "PHOTO" ? hasPhoto(ctx) : hasDocument(ctx, docType)
    items.push({
      key: `doc:${docType}`,
      label: docLabel(docType),
      severity: hit ? "ok" : "warning",
      manual: !hit,
      reason: hit
        ? undefined
        : docReason.get(docType) ??
          "Wordt nog niet automatisch geanalyseerd door SmartDoc — handmatig toevoegen op het portaal of bij de notaris.",
    })
  }

  // Indeterminate-only requirements: surface as warnings (not blockers).
  // Skip if the same doc is already in items via another rule.
  for (const ind of indeterminate) {
    for (const doc of ind.docs) {
      if (items.some((it) => it.key === `doc:${doc}`)) continue
      const hit = doc === "PHOTO" ? hasPhoto(ctx) : hasDocument(ctx, doc)
      items.push({
        key: `doc:${doc}`,
        label: docLabel(doc),
        severity: hit ? "ok" : "warning",
        reason: hit ? undefined : ind.reason,
      })
    }
  }

  // Score: 100 * (ok + 0.5 * warning) / total
  const total = items.length || 1
  const okCount = items.filter((i) => i.severity === "ok").length
  const warnCount = items.filter((i) => i.severity === "warning").length
  const score = Math.round((100 * (okCount + 0.5 * warnCount)) / total)
  const canExport = !items.some((i) => i.severity === "blocker")

  // Stable order: blockers first, warnings, oks
  const severityOrder: Record<string, number> = { blocker: 0, warning: 1, ok: 2 }
  items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  return { score, items, canExport }
}
