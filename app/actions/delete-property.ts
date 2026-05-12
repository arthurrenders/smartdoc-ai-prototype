"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { assertOwnerProperty } from "@/lib/supabase/ownership"

const DeletePropertySchema = z.object({
  propertyId: z.string().uuid(),
})

export async function deleteProperty(formData: FormData) {
  const rawId = formData.get("propertyId")
  const parsed = DeletePropertySchema.safeParse({
    propertyId: typeof rawId === "string" ? rawId : "",
  })

  if (!parsed.success) {
    throw new Error("Invalid property id.")
  }

  const supabase = createServerClient()
  const { ownerUserId } = await assertOwnerProperty(supabase, parsed.data.propertyId)
  const { error } = await supabase
    .from("properties")
    .delete()
    .eq("id", parsed.data.propertyId)
    .eq("user_id", ownerUserId)

  if (error) {
    throw new Error(error.message || "Failed to delete property.")
  }

  revalidatePath("/")
  revalidatePath("/map")
  revalidatePath(`/properties/${parsed.data.propertyId}`)

  return { ok: true as const }
}

