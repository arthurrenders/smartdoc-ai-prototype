"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"

const IdSchema = z.string().uuid()

export async function markNotificationRead(formData: FormData): Promise<void> {
  const raw = formData.get("notificationId")
  const parsed = IdSchema.safeParse(typeof raw === "string" ? raw : "")
  if (!parsed.success) {
    return
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data)

  if (error) {
    console.error("markNotificationRead:", error.message)
    return
  }

  revalidatePath("/")
}
