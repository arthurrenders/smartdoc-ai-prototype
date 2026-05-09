import Papa from "papaparse"
import type { PropertyExportContext } from "../types"
import { extractEpcSummary } from "../adapters/shared"

/**
 * Canonical SmartDoc shape — the same JSON every destination receives,
 * before destination-specific mapping is layered on top.
 */
export function buildCanonicalJson(ctx: PropertyExportContext): string {
  const epc = extractEpcSummary(ctx)
  const a = ctx.address
  const payload = {
    property: {
      id: ctx.property.id,
      display_name: ctx.property.display_name,
      property_type: ctx.property.property_type,
      transaction_type: ctx.property.transaction_type,
      heating_type: ctx.property.heating_type,
      construction_year: ctx.property.construction_year,
      asking_price: ctx.property.asking_price,
      bedrooms: ctx.property.bedrooms,
      living_area_m2: ctx.property.living_area_m2,
      description: ctx.property.description,
    },
    address: a
      ? {
          street_name: a.street_name,
          house_number: a.house_number,
          box: a.box,
          postal_code: a.postal_code,
          municipality: a.municipality,
          region: a.region,
          country_code: a.country_code,
          normalized_full_address: a.normalized_full_address,
          latitude: a.latitude,
          longitude: a.longitude,
        }
      : null,
    epc,
    documents: ctx.documents.map((d) => ({
      document_type: d.document_type_name,
      status: d.status,
    })),
    generated_at: new Date().toISOString(),
  }
  return JSON.stringify(payload, null, 2)
}

export function buildCanonicalCsv(ctx: PropertyExportContext): string {
  const epc = extractEpcSummary(ctx)
  const a = ctx.address
  const flat: Record<string, unknown> = {
    property_id: ctx.property.id,
    display_name: ctx.property.display_name ?? "",
    property_type: ctx.property.property_type ?? "",
    transaction_type: ctx.property.transaction_type ?? "",
    heating_type: ctx.property.heating_type ?? "",
    construction_year: ctx.property.construction_year ?? "",
    asking_price: ctx.property.asking_price ?? "",
    bedrooms: ctx.property.bedrooms ?? "",
    living_area_m2: ctx.property.living_area_m2 ?? "",
    street: a?.street_name ?? "",
    house_number: a?.house_number ?? "",
    box: a?.box ?? "",
    postal_code: a?.postal_code ?? "",
    municipality: a?.municipality ?? "",
    region: a?.region ?? "",
    country_code: a?.country_code ?? "",
    epc_label: epc?.label ?? "",
    epc_kwh_m2_year: epc?.kwh_m2_year ?? "",
    epc_certificate_date: epc?.certificate_date ?? "",
    epc_expiry_date: epc?.expiry_date ?? "",
  }
  return Papa.unparse([flat])
}

export function buildDescriptionTxt(ctx: PropertyExportContext): string {
  const a = ctx.address
  const lines: string[] = []
  lines.push(ctx.property.display_name ?? "Pand")
  if (a?.normalized_full_address) lines.push(a.normalized_full_address)
  lines.push("")
  if (ctx.property.description) {
    lines.push(ctx.property.description)
  } else {
    const parts: string[] = []
    if (ctx.property.bedrooms) parts.push(`${ctx.property.bedrooms} slaapkamers`)
    if (ctx.property.living_area_m2) parts.push(`${ctx.property.living_area_m2} m²`)
    if (ctx.property.construction_year) parts.push(`bouwjaar ${ctx.property.construction_year}`)
    lines.push(parts.length ? parts.join(", ") : "(Geen omschrijving beschikbaar)")
  }
  return lines.join("\n")
}
