"use server"

import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import { assertOwnerDocument } from "@/lib/supabase/ownership"

const PREVIEW_URL_TTL_SECONDS = 300

const inputSchema = z.object({
  documentId: z.string().uuid(),
})

type DocumentRow = {
  storage_path: string | null
  document_types: { name: string | null } | null
}

export type GetDocumentPreviewUrlResult =
  | { ok: true; previewUrl: string; filename: string }
  | { ok: false; error: string }

export async function getDocumentPreviewUrl(
  input: { documentId: string }
): Promise<GetDocumentPreviewUrlResult> {
  const validation = inputSchema.safeParse(input)
  if (!validation.success) {
    return { ok: false, error: "Ongeldige aanvraag." }
  }

  try {
    const supabase = createServerClient()
    await assertOwnerDocument(supabase, validation.data.documentId)

    const { data, error } = await supabase
      .from("documents")
      .select("storage_path, document_types(name)")
      .eq("id", validation.data.documentId)
      .maybeSingle()

    if (error) {
      return { ok: false, error: "Voorbeeld kon niet geladen worden." }
    }

    const row = data as DocumentRow | null
    const storagePath = row?.storage_path
    if (!row || !storagePath) {
      return { ok: false, error: "Document niet gevonden." }
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from("documents")
      .createSignedUrl(storagePath, PREVIEW_URL_TTL_SECONDS, { download: false })

    if (signErr || !signed?.signedUrl) {
      return { ok: false, error: "Voorbeeld kon niet geladen worden." }
    }

    const filename = storagePath.split("/").pop() ?? "document.pdf"

    return { ok: true, previewUrl: signed.signedUrl, filename }
  } catch {
    return { ok: false, error: "Voorbeeld kon niet geladen worden." }
  }
}
