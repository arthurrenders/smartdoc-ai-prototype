import { create } from "xmlbuilder2"
import type { Destination, PropertyExportContext } from "../types"
import { extractEpcSummary, mapValue } from "./shared"
import type { AdapterPayload } from "./zimmo"

export function buildRealoPayload(
  destination: Destination,
  ctx: PropertyExportContext,
): AdapterPayload {
  const map = destination.field_mapping
  const epc = extractEpcSummary(ctx)
  const a = ctx.address

  const root = create({ version: "1.0", encoding: "UTF-8" }).ele("realo_feed")
  const property = root.ele("property", { reference: ctx.property.id })

  property.ele("category").txt(mapValue(map.category, ctx.property.property_type)).up()
  property.ele("transaction").txt(mapValue(map.transaction, ctx.property.transaction_type)).up()

  if (ctx.property.asking_price !== null) {
    property.ele("price", { currency: "EUR" }).txt(String(ctx.property.asking_price)).up()
  }

  const address = property.ele("address")
  if (a?.street_name) address.ele("street").txt(a.street_name).up()
  if (a?.house_number) address.ele("number").txt(a.house_number).up()
  if (a?.box) address.ele("box").txt(a.box).up()
  if (a?.postal_code) address.ele("postal_code").txt(a.postal_code).up()
  if (a?.municipality) address.ele("city").txt(a.municipality).up()
  if (a?.country_code) address.ele("country").txt(a.country_code).up()
  if (a?.latitude !== null && a?.latitude !== undefined) {
    address.ele("latitude").txt(String(a.latitude)).up()
  }
  if (a?.longitude !== null && a?.longitude !== undefined) {
    address.ele("longitude").txt(String(a.longitude)).up()
  }
  address.up()

  if (ctx.property.bedrooms !== null) {
    property.ele("bedrooms").txt(String(ctx.property.bedrooms)).up()
  }
  if (ctx.property.living_area_m2 !== null) {
    property.ele("living_area", { unit: "m2" }).txt(String(ctx.property.living_area_m2)).up()
  }
  if (ctx.property.construction_year !== null) {
    property.ele("construction_year").txt(String(ctx.property.construction_year)).up()
  }

  if (epc) {
    const epcEl = property.ele("epc")
    if (epc.label) epcEl.ele("label").txt(epc.label).up()
    if (epc.kwh_m2_year !== null) {
      epcEl.ele("kwh_m2_year").txt(String(epc.kwh_m2_year)).up()
    }
    if (epc.certificate_date) epcEl.ele("certificate_date").txt(epc.certificate_date).up()
    if (epc.expiry_date) epcEl.ele("expiry_date").txt(epc.expiry_date).up()
    epcEl.up()
  }

  if (ctx.property.description) {
    property.ele("description").txt(ctx.property.description).up()
  }

  const xml = root.end({ prettyPrint: true })

  return {
    filename: "realo_feed.xml",
    contentType: "application/xml",
    body: xml,
  }
}
