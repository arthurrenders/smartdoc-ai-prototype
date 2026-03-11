"use server"

import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const uploadSchema = z.object({
  propertyId: z.string().uuid({ message: "propertyId must be a valid UUID" }),
  documentTypeId: z
    .string()
    .uuid()
    .optional()
    .nullable()
    .transform((val) => val || null),
  file: z.instanceof(File, { message: "File is required and must be a File object" }),
})

export async function uploadDocument(formData: FormData) {
  try {
    const propertyIdRaw = formData.get("propertyId")
    const documentTypeIdRaw = formData.get("documentTypeId")
    const file = formData.get("file") as File | null

    console.log("raw propertyId from formData:", propertyIdRaw)
    console.log("process.env.DEMO_PROPERTY_ID:", process.env.DEMO_PROPERTY_ID)

    // Validate file first (required)
    if (!file || !(file instanceof File)) {
      return {
        ok: false,
        error: "Invalid input data",
        details: { file: "File is required and must be a File object" },
      }
    }

    // Validate PDF type
    if (file.type !== "application/pdf") {
      return {
        ok: false,
        error: "Invalid file type",
        details: { file: "Only PDF files are allowed" },
      }
    }

    // Default propertyId to DEMO_PROPERTY_ID from environment if not provided
    const propertyIdValue =
      propertyIdRaw && propertyIdRaw.toString().trim()
        ? propertyIdRaw.toString().trim()
        : process.env.DEMO_PROPERTY_ID

    if (!propertyIdValue) {
      console.error("Upload validation failed: No propertyId provided and DEMO_PROPERTY_ID not set")
      return {
        ok: false,
        error: "Invalid input data",
        details: {
          propertyId: "propertyId is required. Either provide it in FormData or set DEMO_PROPERTY_ID in .env.local",
        },
      }
    }

    // Validate and coerce other fields
    const validation = uploadSchema.safeParse({
      propertyId: propertyIdValue,
      documentTypeId: documentTypeIdRaw,
      file,
    })

    if (!validation.success) {
      const flattened = validation.error.flatten()
      console.error("Upload validation failed:", {
        payload: {
          propertyId: propertyIdValue,
          documentTypeId: documentTypeIdRaw,
          file: file ? { name: file.name, type: file.type, size: file.size } : null,
        },
        errors: flattened.fieldErrors,
      })
      return {
        ok: false,
        error: "Invalid input data",
        details: flattened.fieldErrors,
      }
    }

    const { propertyId, documentTypeId } = validation.data

    const supabase = createServerClient()

    // Generate unique file path
    const fileExt = file.name.split(".").pop() || "pdf"
    const fileName = documentTypeId
      ? `${propertyId}/${documentTypeId}/${Date.now()}.${fileExt}`
      : `${propertyId}/${Date.now()}.${fileExt}`
    const storagePath = fileName

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, file, {
        contentType: "application/pdf",
        upsert: false,
      })

    if (uploadError) {
      console.error("Storage upload failed:", uploadError)
      return {
        ok: false,
        error: `Storage upload failed: ${uploadError.message}`,
        details: { storage: uploadError.message },
      }
    }

    // Insert document row
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        property_id: propertyId, // propertyId is already a string
        document_type_id: documentTypeId,
        storage_path: storagePath,
        status: "uploaded",
      })
      .select()
      .single()

    if (documentError || !document) {
      console.error("Document insert failed:", documentError)
      // Clean up uploaded file if document insert fails
      await supabase.storage.from("documents").remove([fileName]).catch((err) => {
        console.error("Failed to cleanup uploaded file:", err)
      })
      return {
        ok: false,
        error: `Failed to create document: ${documentError?.message || "Unknown error"}`,
        details: { database: documentError?.message },
      }
    }

    // Insert analysis_run row
    const { error: analysisError } = await supabase
      .from("analysis_runs")
      .insert({
        document_id: document.id,
        status: "queued",
      })

    if (analysisError) {
      console.error("Analysis run insert failed:", analysisError)
      return {
        ok: false,
        error: `Failed to create analysis run: ${analysisError.message}`,
        details: { analysis: analysisError.message },
      }
    }

    revalidatePath(`/properties/${propertyId}`)

    return { ok: true, documentId: document.id }
  } catch (error) {
    console.error("Unexpected error in uploadDocument:", error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      details: { unexpected: "An unexpected error occurred" },
    }
  }
}

