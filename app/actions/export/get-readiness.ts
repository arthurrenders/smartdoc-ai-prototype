"use server"

import { loadPropertyExportContext } from "@/lib/export/context"
import { getDestinationBySlug, listEnabledDestinations } from "@/lib/export/destinations"
import { evaluateReadiness } from "@/lib/export/readiness/evaluate"
import type { ReadinessResult } from "@/lib/export/types"

export type DestinationSummary = {
  id: string
  slug: string
  name: string
  output_format: "json" | "csv" | "xml" | "full_bundle"
  type: "portal" | "crm" | "legal"
}

export async function listExportDestinations(): Promise<
  | { ok: true; destinations: DestinationSummary[] }
  | { ok: false; error: string }
> {
  try {
    const destinations = await listEnabledDestinations()
    return {
      ok: true,
      destinations: destinations.map((d) => ({
        id: d.id,
        slug: d.slug,
        name: d.name,
        output_format: d.output_format,
        type: d.type,
      })),
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kon bestemmingen niet laden." }
  }
}

export async function getExportReadiness(input: {
  propertyId: string
  destinationSlug: string
}): Promise<
  | {
      ok: true
      result: ReadinessResult
      destination: { name: string; slug: string; output_format: string }
    }
  | { ok: false; error: string }
> {
  try {
    const destination = await getDestinationBySlug(input.destinationSlug)
    if (!destination) return { ok: false, error: "Onbekende bestemming." }

    const ctx = await loadPropertyExportContext(input.propertyId)
    const result = evaluateReadiness(destination, ctx)

    return {
      ok: true,
      result,
      destination: {
        name: destination.name,
        slug: destination.slug,
        output_format: destination.output_format,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Kon geschiktheid niet bepalen." }
  }
}
