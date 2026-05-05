"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { getOwnerUserId } from "@/lib/supabase/ownership"

const IdSchema = z.string().uuid()

export async function markNotificationRead(formData: FormData): Promise<void> {
  const raw = formData.get("notificationId")
  const parsed = IdSchema.safeParse(typeof raw === "string" ? raw : "")
  if (!parsed.success) {
    return
  }

  const supabase = createServerClient()
  const ownerUserId = await getOwnerUserId(supabase)
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("user_id", ownerUserId)

  if (error) {
    console.error("markNotificationRead:", error.message)
    return
  }

  revalidatePath("/")
}

