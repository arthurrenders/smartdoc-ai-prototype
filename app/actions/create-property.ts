"use server"

import "server-only"
import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"
import { z } from "zod"
import { escapeForIlike } from "@/lib/properties/display-name-match"

const CreatePropertySchema = z.object({
  displayName: z
    .string()
    .min(1, "Property name is required.")
    .max(80, "Property name must be at most 80 characters.")
    .transform((v) => v.trim()),
})

const DUPLICATE_NAME_MESSAGE =
  "A property with this name already exists. Please choose a different name."

export async function createProperty(formData: FormData) {
  const rawName = formData.get("displayName")
  const parsedName = CreatePropertySchema.safeParse({
    displayName: typeof rawName === "string" ? rawName : "",
  })

  if (!parsedName.success) {
    throw new Error(parsedName.error.issues[0]?.message ?? "Invalid property name.")
  }

  const displayName = parsedName.data.displayName

  const supabase = createServerClient()
  const ownerUserId = await resolveOwnerUserId(supabase)

  const { data: existingDup, error: dupError } = await supabase
    .from("properties")
    .select("id")
    .ilike("display_name", escapeForIlike(displayName))
    .limit(1)

  if (dupError) {
    throw new Error(dupError.message ?? "Could not validate property name.")
  }

  if (existingDup && existingDup.length > 0) {
    throw new Error(DUPLICATE_NAME_MESSAGE)
  }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("properties")
    .insert({
      user_id: ownerUserId,
      display_name: displayName,
      updated_at: now,
    })
    .select("id")
    .single()

  if (error) {
    if (error.code === "23505") {
      throw new Error(DUPLICATE_NAME_MESSAGE)
    }
    throw new Error(error.message ?? "Failed to create property")
  }

  if (!data) {
    throw new Error("Failed to create property")
  }

  const newId = data.id as string

  const { error: addressError } = await supabase.from("property_addresses").insert({
    property_id: newId,
    source: "create_property",
    raw_line1: displayName,
    country_code: "BE",
    updated_at: now,
  })

  if (addressError) {
    await supabase.from("properties").delete().eq("id", newId)
    throw new Error(addressError.message ?? "Failed to create property address.")
  }

  revalidatePath("/")
  revalidatePath(`/properties/${newId}`)

  return { id: newId }
}
