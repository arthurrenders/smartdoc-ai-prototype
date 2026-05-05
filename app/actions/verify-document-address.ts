"use server"

import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { extractAddressFromPdfBuffer } from "@/lib/address-matching/extract-from-pdf-buffer"
import { buildCanonicalExpectedAddress } from "@/lib/address-matching/expected-address"
import { verifyUploadAddressCoreFields } from "@/lib/address-matching/verify-upload-core-fields"
import type { PropertyAddressRecord } from "@/lib/property-address/types"
import { assertOwnerDocument } from "@/lib/supabase/ownership"

const schema = z.object({
  documentId: z.string().uuid(),
})

export async function verifyDocumentAddress(formData: FormData) {
  const parsed = schema.safeParse({
    documentId: formData.get("documentId"),
  })

  if (!parsed.success) {
    return { ok: false as const, error: "Invalid document id" }
  }

  const { documentId } = parsed.data
  const supabase = createServerClient()

  try {
    await assertOwnerDocument(supabase, documentId)
    const { data: document, error: docErr } = await supabase
      .from("documents")
      .select("id, property_id, storage_path")
      .eq("id", documentId)
      .single()

    if (docErr || !document) {
      return { ok: false as const, error: docErr?.message ?? "Document not found" }
    }

    const propertyId = document.property_id as string

    const { data: addrRow, error: addrErr } = await supabase
      .from("property_addresses")
      .select("*")
      .eq("property_id", propertyId)
      .maybeSingle()

    if (addrErr) {
      console.error("verifyDocumentAddress: property_addresses", addrErr.message)
    }

    const propertyAddress = (addrRow as PropertyAddressRecord | null) ?? null

    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from("documents")
      .download(document.storage_path as string)

    if (downloadError || !pdfBlob) {
      await supabase
        .from("documents")
        .update({
          expected_property_id: propertyId,
          expected_address: propertyAddress ? buildCanonicalExpectedAddress(propertyAddress) : null,
          extracted_document_address: null,
          address_match_status: "unknown",
          address_match_confidence: 0.15,
          address_match_reason: "Address verification could not read the uploaded file.",
        })
        .eq("id", documentId)

      revalidatePath(`/properties/${propertyId}`)
      return { ok: true as const }
    }

    const buffer = Buffer.from(await pdfBlob.arrayBuffer())
    const { extracted } = await extractAddressFromPdfBuffer(buffer)
    const outcome = verifyUploadAddressCoreFields(extracted, propertyAddress)

    const { error: upErr } = await supabase
      .from("documents")
      .update({
        expected_property_id: propertyId,
        expected_address: outcome.expectedAddress,
        extracted_document_address: outcome.extractedDocumentAddress,
        address_match_status: outcome.status,
        address_match_confidence: outcome.confidence,
        address_match_reason: outcome.reason,
      })
      .eq("id", documentId)

    if (upErr) {
      console.error("verifyDocumentAddress: documents update", upErr.message)
      return { ok: false as const, error: upErr.message }
    }

    revalidatePath(`/properties/${propertyId}`)
    return { ok: true as const }
  } catch (e) {
    console.error("verifyDocumentAddress:", e)
    try {
      const supabase2 = createServerClient()
      const { data: doc } = await supabase2
        .from("documents")
        .select("property_id")
        .eq("id", documentId)
        .single()
      if (doc?.property_id) {
        await supabase2
          .from("documents")
          .update({
            expected_property_id: doc.property_id as string,
            address_match_status: "unknown",
            address_match_confidence: 0.1,
            address_match_reason: "Address verification could not be completed.",
          })
          .eq("id", documentId)
        revalidatePath(`/properties/${doc.property_id as string}`)
      }
    } catch {
      /* ignore */
    }
    return { ok: false as const, error: e instanceof Error ? e.message : "Verification failed" }
  }
}

