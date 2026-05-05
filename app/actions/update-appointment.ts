"use server"

import { revalidatePath } from "next/cache"
import { createServerClient } from "@/lib/supabase/server"
import { assertOwnerAppointment, assertOwnerProperty } from "@/lib/supabase/ownership"
import { AppointmentFormSchema, firstZodMessage } from "@/lib/validation"

export type UpdateAppointmentResult =
  | { ok: true }
  | { ok: false; error: string; conflict?: false }
  | { ok: false; conflict: true; conflictTitle: string }

export async function updateAppointment(
  formData: FormData,
  forceUpdate = false
): Promise<UpdateAppointmentResult> {
  try {
    const parsed = AppointmentFormSchema.safeParse({
      id: formData.get("id"),
      title: formData.get("title"),
      date: formData.get("date"),
      start_time: formData.get("start_time"),
      end_time: formData.get("end_time"),
      property_id: formData.get("property_id"),
      description: formData.get("description"),
      client_name: formData.get("client_name"),
      client_email: formData.get("client_email"),
      client_phone: formData.get("client_phone"),
      location: formData.get("location"),
    })
    if (!parsed.success) return { ok: false, error: firstZodMessage(parsed.error) }
    if (!parsed.data.id) return { ok: false, error: "Missing id." }

    const supabase = createServerClient()
    const current = await assertOwnerAppointment(supabase, parsed.data.id)
    const input = parsed.data

    if (input.property_id) {
      await assertOwnerProperty(supabase, input.property_id)
    }

    const start_at = `${input.date}T${input.start_time}:00`
    const end_at = `${input.date}T${input.end_time}:00`

    if (!forceUpdate) {
      const { data: conflicts, error: conflictError } = await supabase
        .from("appointments")
        .select("id, title")
        .eq("user_id", current.ownerUserId)
        .neq("id", input.id)
        .lt("start_at", end_at)
        .gt("end_at", start_at)
        .limit(1)

      if (conflictError) return { ok: false, error: conflictError.message }
      if (conflicts && conflicts.length > 0) {
        return {
          ok: false,
          conflict: true,
          conflictTitle: (conflicts[0] as { title: string }).title,
        }
      }
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        property_id: input.property_id,
        title: input.title,
        description: input.description,
        start_at,
        end_at,
        client_name: input.client_name,
        client_email: input.client_email,
        client_phone: input.client_phone,
        location: input.location,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("user_id", current.ownerUserId)

    if (error) return { ok: false, error: error.message }

    revalidatePath("/")
    if (current.propertyId) revalidatePath(`/properties/${current.propertyId}`)
    if (input.property_id && input.property_id !== current.propertyId) {
      revalidatePath(`/properties/${input.property_id}`)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Onbekende fout." }
  }
}

