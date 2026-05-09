import Papa from "papaparse"
import type { Destination, PropertyExportContext } from "../types"
import { extractEpcSummary, mapValue } from "./shared"

export type AdapterPayload = {
  filename: string
  contentType: string
  body: Buffer | string
}

export function buildZimmoPayload(
  destination: Destination,
  ctx: PropertyExportContext,
): AdapterPayload {
  const map = destination.field_mapping
  const epc = extractEpcSummary(ctx)
  const a = ctx.address

  const row: Record<string, string | number | null> = {
    category: mapValue(map.category, ctx.property.property_type),
    transaction: mapValue(map.transaction, ctx.property.transaction_type),
    price: ctx.property.asking_price,
    street: a?.street_name ?? null,
    house_number: a?.house_number ?? null,
    box: a?.box ?? null,
    postal_code: a?.postal_code ?? null,
    city: a?.municipality ?? null,
    bedrooms: ctx.property.bedrooms,
    living_area_m2: ctx.property.living_area_m2,
    construction_year: ctx.property.construction_year,
    epc_label: epc?.label ?? null,
    epc_kwh_m2_year: epc?.kwh_m2_year ?? null,
    description: ctx.property.description ?? null,
  }

  const columns =
    Array.isArray(map.csv_columns) && map.csv_columns.length > 0
      ? (map.csv_columns as string[])
      : Object.keys(row)

  const csv = Papa.unparse({
    fields: columns,
    data: [columns.map((c) => row[c] ?? "")],
  })

  return {
    filename: "zimmo_payload.csv",
    contentType: "text/csv",
    body: csv,
  }
}
