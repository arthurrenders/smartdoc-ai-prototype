"use server"

import "server-only"
import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { z } from "zod"

export async function createProperty(formData: FormData) {
  const supabase = createServerClient()

  // Validate required inputs.
  // Current schema only requires `user_id` (and the FK must reference an existing auth user).
  // This app currently has no explicit login flow, so we infer `user_id` from existing data.

  // 1) Try to use an authenticated user session (if present).
  const maybeUser = await supabase.auth
    .getUser()
    .then((res) => ({ user: res.data.user, error: res.error }))
    .catch((err) => ({ user: null, error: err as Error }))

  const authUserId =
    maybeUser.user?.id && z.string().uuid().safeParse(maybeUser.user.id).success
      ? maybeUser.user.id
      : null

  // 2) If no auth session, infer user_id from existing properties for this environment.
  // Prefer DEMO_PROPERTY_ID so behaviour matches the demo dataset.
  const demoId = process.env.DEMO_PROPERTY_ID
  const { data: inferredUserRow, error: inferUserError } = await (async () => {
    if (authUserId) return { data: { user_id: authUserId }, error: null as string | null }

    if (demoId) {
      const res = await supabase
        .from("properties")
        .select("user_id")
        .eq("id", demoId)
        .maybeSingle()
      return { data: res.data, error: res.error?.message ?? null }
    }

    const res = await supabase.from("properties").select("user_id").limit(1).maybeSingle()
    return { data: res.data, error: res.error?.message ?? null }
  })()

  if (inferUserError) {
    throw new Error(`Failed to infer user_id: ${inferUserError}`)
  }

  const userIdFromDb = inferredUserRow?.user_id ?? null
  const parsedUserId = userIdFromDb && z.string().uuid().safeParse(userIdFromDb).success
    ? userIdFromDb
    : null

  if (!parsedUserId) {
    throw new Error(
      "Not authenticated and could not infer user_id from existing properties. Ensure DEMO_PROPERTY_ID points to an existing property row."
    )
  }

  const { data, error } = await supabase
    .from("properties")
    .insert({ user_id: parsedUserId })
    .select("id")
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create property")
  }

  const newId = data.id as string

  // Ensure listing and detail views update immediately.
  revalidatePath("/")
  revalidatePath(`/properties/${newId}`)

  return { id: newId }
}
