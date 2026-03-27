"use client"

import { useEffect } from "react"
import Link from "next/link"
import L from "leaflet"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { MapMarkerRow } from "@/app/actions/get-map-markers"
import { StatusBadge } from "@/components/ui/StatusBadge"

type Props = {
  markers: MapMarkerRow[]
  className?: string
}

/** Matches StatusBadge-style greens / ambers / reds (prototype). */
const STATUS_MARKER_ICONS: Record<
  MapMarkerRow["status"],
  L.DivIcon
> = {
  green: L.divIcon({
    className: "leaflet-div-icon smartdoc-map-marker",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#059669;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.32);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  }),
  orange: L.divIcon({
    className: "leaflet-div-icon smartdoc-map-marker",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#d97706;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.32);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  }),
  red: L.divIcon({
    className: "leaflet-div-icon smartdoc-map-marker",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#dc2626;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.32);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  }),
}

function FitBounds({ markers }: { markers: MapMarkerRow[] }) {
  const map = useMap()
  useEffect(() => {
    if (markers.length === 0) return
    if (markers.length === 1) {
      map.setView([markers[0].latitude, markers[0].longitude], 14)
      return
    }
    const b = L.latLngBounds(
      markers.map((m) => [m.latitude, m.longitude] as [number, number])
    )
    map.fitBounds(b, { padding: [48, 48], maxZoom: 16 })
  }, [map, markers])
  return null
}

const BELGIUM_CENTER: [number, number] = [50.85, 4.35]

export default function PropertiesMap({ markers, className }: Props) {
  return (
    <MapContainer
      center={BELGIUM_CENTER}
      zoom={8}
      className={className ?? "z-0 h-[min(70vh,560px)] w-full rounded-2xl border border-[hsl(var(--border))] shadow-md"}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds markers={markers} />
      {markers.map((m) => (
        <Marker
          key={m.propertyId}
          position={[m.latitude, m.longitude]}
          icon={STATUS_MARKER_ICONS[m.status]}
        >
          <Popup>
            <div className="min-w-[200px] space-y-2 text-sm">
              <p className="font-semibold text-foreground">{m.displayName}</p>
              <p className="text-muted-foreground">{m.addressLabel}</p>
              <StatusBadge status={m.status} />
              <div>
                <Link
                  href={`/properties/${m.propertyId}`}
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  Naar pand
                </Link>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
