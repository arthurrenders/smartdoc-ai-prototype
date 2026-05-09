"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { assertOwnerProperty } from "@/lib/supabase/ownership"

const TransactionType = z.enum(["sale", "rent"]).nullable()
const HeatingType = z.enum(["gas", "oil", "electric", "heat_pump", "district", "other"]).nullable()
const PropertyType = z.enum(["house", "apartment", "land", "commercial", "other"]).nullable()

const Schema = z.object({
  propertyId: z.string().uuid(),
  construction_year: z
    .number()
    .int()
    .min(1700)
    .max(2100)
    .nullable(),
  transaction_type: TransactionType,
  heating_type: HeatingType,
  property_type: PropertyType,
  asking_price: z.number().min(0).max(99_999_999).nullable(),
  bedrooms: z.number().int().min(0).max(50).nullable(),
  living_area_m2: z.number().min(0).max(100_000).nullable(),
  description: z.string().max(8000).nullable(),
})

export type UpdatePropertyMetadataInput = z.infer<typeof Schema>

function nullIfBlank(s: FormDataEntryValue | null): string | null {
  if (s === null) return null
  const v = typeof s === "string" ? s.trim() : ""
  return v === "" ? null : v
}

function intOrNull(s: FormDataEntryValue | null): number | null {
  const v = nullIfBlank(s)
  if (v === null) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

function numberOrNull(s: FormDataEntryValue | null): number | null {
  const v = nullIfBlank(s)
  if (v === null) return null
  const n = parseFloat(v.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

export async function updatePropertyMetadata(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const propertyId = nullIfBlank(formData.get("propertyId")) ?? ""
    const parsed = Schema.safeParse({
      propertyId,
      construction_year: intOrNull(formData.get("construction_year")),
      transaction_type: nullIfBlank(formData.get("transaction_type")) as never,
      heating_type: nullIfBlank(formData.get("heating_type")) as never,
      property_type: nullIfBlank(formData.get("property_type")) as never,
      asking_price: numberOrNull(formData.get("asking_price")),
      bedrooms: intOrNull(formData.get("bedrooms")),
      living_area_m2: numberOrNull(formData.get("living_area_m2")),
      description: nullIfBlank(formData.get("description")),
    })

    if (!parsed.success) {
      return { ok: false, error: "Ongeldige invoer." }
    }

    const supabase = createServerClient()
    await assertOwnerProperty(supabase, parsed.data.propertyId)

    const { error } = await supabase
      .from("properties")
      .update({
        construction_year: parsed.data.construction_year,
        transaction_type: parsed.data.transaction_type,
        heating_type: parsed.data.heating_type,
        property_type: parsed.data.property_type,
        asking_price: parsed.data.asking_price,
        bedrooms: parsed.data.bedrooms,
        living_area_m2: parsed.data.living_area_m2,
        description: parsed.data.description,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.data.propertyId)

    if (error) return { ok: false, error: error.message }

    revalidatePath(`/properties/${parsed.data.propertyId}`)
    revalidatePath("/")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Opslaan mislukt." }
  }
}

export async function getPropertyMetadata(
  propertyId: string,
): Promise<
  | {
      ok: true
      metadata: {
        construction_year: number | null
        transaction_type: string | null
        heating_type: string | null
        property_type: string | null
        asking_price: number | null
        bedrooms: number | null
        living_area_m2: number | null
        description: string | null
      }
    }
  | { ok: false; error: string }
> {
  try {
    const supabase = createServerClient()
    await assertOwnerProperty(supabase, propertyId)
    const { data, error } = await supabase
      .from("properties")
      .select(
        "construction_year, transaction_type, heating_type, property_type, asking_price, bedrooms, living_area_m2, description",
      )
      .eq("id", propertyId)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: "Pand niet gevonden." }
    return {
      ok: true,
      metadata: data as {
        construction_year: number | null
        transaction_type: string | null
        heating_type: string | null
        property_type: string | null
        asking_price: number | null
        bedrooms: number | null
        living_area_m2: number | null
        description: string | null
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kon gegevens niet laden." }
  }
}
