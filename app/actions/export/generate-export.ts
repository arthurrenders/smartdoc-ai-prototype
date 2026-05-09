"use server"

import { createServerClient } from "@/lib/supabase/server"
import { loadPropertyExportContext } from "@/lib/export/context"
import { getDestinationBySlug } from "@/lib/export/destinations"
import { evaluateReadiness } from "@/lib/export/readiness/evaluate"
import { buildExportZip } from "@/lib/export/generators/zip"
import type { ReadinessResult } from "@/lib/export/types"

const SIGNED_URL_TTL_SECONDS = 600

export async function generateExport(input: {
  propertyId: string
  destinationSlug: string
}): Promise<
  | {
      ok: true
      exportRunId: string
      downloadUrl: string
      filename: string
      readiness: ReadinessResult
    }
  | { ok: false; error: string; readiness?: ReadinessResult }
> {
  const supabase = createServerClient()
  let exportRunId: string | null = null

  try {
    const destination = await getDestinationBySlug(input.destinationSlug)
    if (!destination) return { ok: false, error: "Onbekende bestemming." }

    const ctx = await loadPropertyExportContext(input.propertyId)
    const readiness = evaluateReadiness(destination, ctx)

    if (!readiness.canExport) {
      return {
        ok: false,
        error: "Er zijn nog blokkerende ontbrekende items. Vul eerst de vereiste documenten/velden aan.",
        readiness,
      }
    }

    // Create the run row in 'queued' state so we can persist progress.
    const { data: runRow, error: insErr } = await supabase
      .from("export_runs")
      .insert({
        property_id: input.propertyId,
        destination_id: destination.id,
        status: "generating",
        readiness_score: readiness.score,
        missing_items: readiness.items.filter((i) => i.severity !== "ok"),
      })
      .select("id")
      .single()

    if (insErr || !runRow) {
      return { ok: false, error: insErr?.message ?? "Kon exportrun niet aanmaken." }
    }
    exportRunId = (runRow as { id: string }).id

    const zipBuffer = await buildExportZip({ ctx, destination, readiness })
    const storagePath = `${input.propertyId}/${exportRunId}.zip`

    const { error: uploadErr } = await supabase.storage
      .from("exports")
      .upload(storagePath, zipBuffer, {
        contentType: "application/zip",
        upsert: true,
      })
    if (uploadErr) {
      await supabase
        .from("export_runs")
        .update({ status: "error", error_message: uploadErr.message, completed_at: new Date().toISOString() })
        .eq("id", exportRunId)
      return { ok: false, error: uploadErr.message }
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from("exports")
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, { download: true })

    if (signErr || !signed?.signedUrl) {
      await supabase
        .from("export_runs")
        .update({ status: "error", error_message: signErr?.message, completed_at: new Date().toISOString() })
        .eq("id", exportRunId)
      return { ok: false, error: signErr?.message ?? "Kon downloadlink niet aanmaken." }
    }

    await supabase
      .from("export_runs")
      .update({ status: "done", storage_path: storagePath, completed_at: new Date().toISOString() })
      .eq("id", exportRunId)

    const safeName = (ctx.property.display_name ?? "pand").replace(/[^a-z0-9-_]+/gi, "_")
    const filename = `smartdoc_${destination.slug}_${safeName}.zip`

    return {
      ok: true,
      exportRunId,
      downloadUrl: signed.signedUrl,
      filename,
      readiness,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout tijdens exporteren."
    if (exportRunId) {
      await supabase
        .from("export_runs")
        .update({ status: "error", error_message: message, completed_at: new Date().toISOString() })
        .eq("id", exportRunId)
    }
    return { ok: false, error: message }
  }
}
