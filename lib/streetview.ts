type Coords = { latitude: number | string; longitude: number | string }

const SIZE_MAP: Record<string, { w: number; h: number }> = {
  "640x320": { w: 640, h: 320 },
  "400x200": { w: 400, h: 200 },
  "640x480": { w: 640, h: 480 },
}

export function streetViewUrl(
  location: Coords,
  size: "640x320" | "400x200" | "640x480" = "640x320"
): string {
  const token = process.env.MAPBOX_ACCESS_TOKEN?.trim()
  if (!token) return ""
  const { w, h } = SIZE_MAP[size]
  const lon = Number(location.longitude).toFixed(6)
  const lat = Number(location.latitude).toFixed(6)
  return (
    `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static` +
    `/${lon},${lat},17,0/${w}x${h}@2x?access_token=${token}`
  )
}
