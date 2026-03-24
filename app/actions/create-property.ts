"use server"

import "server-only"
import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { z } from "zod"

const CreatePropertySchema = z.object({
  displayName: z
    .string()
    .min(1, "Property name is required.")
    .max(80, "Property name must be at most 80 characters.")
    .transform((v) => v.trim()),
})

const DUPLICATE_NAME_MESSAGE =
  "A property with this name already exists. Please choose a different name."

/** Escape % and _ so ilike is exact match, not a pattern. */
function escapeForIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

/**
 * Single-user tool: no login. Resolve owner UUID in order:
 * 1) PROPERTIES_OWNER_USER_ID in .env.local (paste from properties.user_id in Supabase)
 * 2) user_id on the row whose id is DEMO_PROPERTY_ID (if set)
 * 3) user_id on any existing property row
 */
async function resolveOwnerUserId(
  supabase: ReturnType<typeof createServerClient>
): Promise<string> {
  const fromEnv = process.env.PROPERTIES_OWNER_USER_ID?.trim()
  const envParsed = fromEnv ? z.string().uuid().safeParse(fromEnv) : null
  if (envParsed?.success) {
    return envParsed.data
  }

  const demoId = process.env.DEMO_PROPERTY_ID?.trim()
  const demoParsed = demoId ? z.string().uuid().safeParse(demoId) : null
  if (demoParsed?.success) {
    const { data, error } = await supabase
      .from("properties")
      .select("user_id")
      .eq("id", demoParsed.data)
      .maybeSingle()

    if (!error && data?.user_id) {
      const uid = z.string().uuid().safeParse(data.user_id)
      if (uid.success) return uid.data
    }
  }

  const { data: row, error: rowError } = await supabase
    .from("properties")
    .select("user_id")
    .limit(1)
    .maybeSingle()

  if (!rowError && row?.user_id) {
    const uid = z.string().uuid().safeParse(row.user_id)
    if (uid.success) return uid.data
  }

  throw new Error(
    "Could not resolve owner user id. Set PROPERTIES_OWNER_USER_ID in .env.local to the UUID in properties.user_id (Supabase), " +
      "or set DEMO_PROPERTY_ID to an existing property id so user_id can be read from that row."
  )
}

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

  revalidatePath("/")
  revalidatePath(`/properties/${newId}`)

  return { id: newId }
}
