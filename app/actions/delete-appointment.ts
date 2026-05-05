"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { assertOwnerAppointment } from "@/lib/supabase/ownership"

const IdSchema = z.string().uuid()

export async function deleteAppointment(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = IdSchema.safeParse(id)
    if (!parsed.success) return { ok: false, error: "Invalid appointment id." }

    const supabase = createServerClient()
    const current = await assertOwnerAppointment(supabase, parsed.data)
    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", parsed.data)
      .eq("user_id", current.ownerUserId)

    if (error) return { ok: false, error: error.message }
    revalidatePath("/")
    if (current.propertyId) revalidatePath(`/properties/${current.propertyId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Onbekende fout." }
  }
}

