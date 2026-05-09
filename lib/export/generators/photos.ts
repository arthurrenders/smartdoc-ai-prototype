import "server-only"
import type { PropertyExportContext } from "../types"
import { streetViewUrl } from "@/lib/streetview"
import { createServerClient } from "@/lib/supabase/server"

export type PhotoEntry = {
  filename: string
  body: Buffer
  source: "satellite" | "uploaded"
}

/**
 * In v1 the satellite snapshot stands in for "main photo" so the readiness
 * rule for PHOTO is satisfied. We additionally include any uploaded PHOTO
 * documents (none today, but the doc-type seed allows it for future use).
 */
export async function collectPhotos(ctx: PropertyExportContext): Promise<PhotoEntry[]> {
  const photos: PhotoEntry[] = []
  let index = 0

  const a = ctx.address
  if (a?.latitude !== null && a?.longitude !== null && a?.latitude !== undefined && a?.longitude !== undefined) {
    const url = streetViewUrl({ latitude: a.latitude, longitude: a.longitude }, "640x480")
    if (url) {
      try {
        const res = await fetch(url, { cache: "no-store" })
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer())
          index += 1
          photos.push({
            filename: `${String(index).padStart(2, "0")}_main.jpg`,
            body: buf,
            source: "satellite",
          })
        }
      } catch {
        // Swallow — satellite is best-effort. Folder will simply be empty.
      }
    }
  }

  const supabase = createServerClient()
  const photoDocs = ctx.documents.filter((d) => d.document_type_name?.toUpperCase() === "PHOTO")
  for (const doc of photoDocs) {
    const { data, error } = await supabase.storage.from("documents").download(doc.storage_path)
    if (error || !data) continue
    const buf = Buffer.from(await data.arrayBuffer())
    index += 1
    const ext = doc.storage_path.split(".").pop()?.toLowerCase() || "jpg"
    photos.push({
      filename: `${String(index).padStart(2, "0")}_photo.${ext}`,
      body: buf,
      source: "uploaded",
    })
  }

  return photos
}
