"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

const RenamePropertySchema = z.object({
  propertyId: z.string().uuid(),
  displayName: z.string().min(1).max(80).transform((v) => v.trim()),
})

export async function renameProperty(formData: FormData) {
  const rawPropertyId = formData.get("propertyId")
  const rawDisplayName = formData.get("displayName")

  const parsed = RenamePropertySchema.safeParse({
    propertyId: typeof rawPropertyId === "string" ? rawPropertyId : "",
    displayName: typeof rawDisplayName === "string" ? rawDisplayName : "",
  })

  if (!parsed.success) {
    throw new Error("Invalid input for property rename.")
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables.")
  }

  // Use direct PostgREST calls to avoid Supabase-js schema-cache issues
  // when columns are added via migrations.
  async function postgrest<T>(path: string, init: RequestInit) {
    const res = await fetch(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    })

    if (!res.ok) {
      let details: string | undefined
      try {
        const body = (await res.json()) as {
          message?: string
          hint?: string
          details?: string
          code?: string
        }
        details = body?.message ?? body?.hint ?? body?.details
        if (
          body?.code === "23505" ||
          (typeof details === "string" &&
            details.toLowerCase().includes("duplicate") &&
            details.toLowerCase().includes("display_name"))
        ) {
          throw new Error(
            "A property with this name already exists. Please choose a different name."
          )
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("A property with this name")) {
          throw err
        }
        // ignore json parsing errors
      }
      throw new Error(details || `Failed to rename property (HTTP ${res.status}).`)
    }

    // Prefer representation if requested, otherwise may return empty body.
    const text = await res.text()
    if (!text) return null as unknown as T
    return JSON.parse(text) as T
  }

  const newName = parsed.data.displayName
  const propertyId = parsed.data.propertyId

  // Enforce "no duplicate property names" (case-insensitive).
  // NOTE: We also enforce at DB level via a unique index, but this
  // allows a friendlier error message.
  const existing = await postgrest<Array<{ id: string }>>(
    `/rest/v1/properties?select=id&display_name=ilike.${encodeURIComponent(newName)}&limit=1`,
    {
      method: "GET",
    }
  )

  if (Array.isArray(existing) && existing.length > 0 && existing[0]?.id !== propertyId) {
    throw new Error("A property with this name already exists. Please choose a different name.")
  }

  await postgrest(
    `/rest/v1/properties?id=eq.${propertyId}`,
    {
      method: "PATCH",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        display_name: newName,
        updated_at: new Date().toISOString(),
      }),
    }
  )

  // Ensure dashboard + detail views reflect the updated name.
  revalidatePath("/")
  revalidatePath(`/properties/${parsed.data.propertyId}`)

  return { ok: true as const }
}

