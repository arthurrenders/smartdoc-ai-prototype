"use server"

import "server-only"
import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { resolveOwnerUserId } from "@/lib/supabase/resolve-owner-user-id"
import { z } from "zod"
import { escapeForIlike } from "@/lib/properties/display-name-match"
import { createProperty as createPropertyRecord } from "@/lib/properties/create-property"

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
    .eq("user_id", ownerUserId)
    .limit(1)

  if (dupError) {
    throw new Error(dupError.message ?? "Could not validate property name.")
  }

  if (existingDup && existingDup.length > 0) {
    throw new Error(DUPLICATE_NAME_MESSAGE)
  }

  const created = await createPropertyRecord(supabase, {
    userId: ownerUserId,
    displayName,
    addressLine: displayName,
    source: "create_property",
  })
  if (!created.ok) {
    if (created.error.toLowerCase().includes("duplicate") || created.error.toLowerCase().includes("unique")) {
      throw new Error(DUPLICATE_NAME_MESSAGE)
    }
    throw new Error(created.error)
  }
  const newId = created.propertyId

  revalidatePath("/")
  revalidatePath("/map")
  revalidatePath(`/properties/${newId}`)

  return { id: newId }
}

