"use server"

import "server-only"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { assertOwnerDocument } from "@/lib/supabase/ownership"
import { setActiveDocumentVersion } from "@/lib/documents/active-version"

const schema = z.object({
  propertyId: z.string().uuid(),
  documentId: z.string().uuid(),
  documentTypeId: z.string().uuid(),
})

export async function chooseActiveDocumentVersion(input: z.infer<typeof schema>): Promise<{
  ok: boolean
  error?: string
}> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Invalid document selection." }
  }

  try {
    const supabase = createServerClient()
    await assertOwnerDocument(supabase, parsed.data.documentId, parsed.data.propertyId)

    const { data: doc, error: fetchErr } = await supabase
      .from("documents")
      .select("id, property_id, document_type_id")
      .eq("id", parsed.data.documentId)
      .eq("property_id", parsed.data.propertyId)
      .maybeSingle()

    if (fetchErr) return { ok: false, error: fetchErr.message }
    if (!doc || doc.document_type_id !== parsed.data.documentTypeId) {
      return { ok: false, error: "Document does not belong to this document type." }
    }

    const result = await setActiveDocumentVersion(supabase, parsed.data)
    if (!result.ok) return result

    revalidatePath(`/properties/${parsed.data.propertyId}`)
    revalidatePath("/")
    revalidatePath("/map")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not select active document." }
  }
}
