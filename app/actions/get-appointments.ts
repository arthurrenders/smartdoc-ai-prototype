"use server"

import { createServerClient } from "@/lib/supabase/server"
import { getOwnerUserId } from "@/lib/supabase/ownership"
import type { AppointmentEntry } from "@/lib/app-types"

export type { AppointmentEntry }

type RawAppointment = {
  id: string
  property_id: string | null
  title: string
  description: string | null
  start_at: string
  end_at: string
  client_name: string | null
  client_email: string | null
  client_phone: string | null
  location: string | null
  properties?:
    | {
        display_name?: string | null
        property_addresses?:
          | { normalized_full_address?: string | null }
          | { normalized_full_address?: string | null }[]
          | null
      }
    | {
        display_name?: string | null
        property_addresses?:
          | { normalized_full_address?: string | null }
          | { normalized_full_address?: string | null }[]
          | null
      }[]
    | null
}

function parseRaw(r: RawAppointment): AppointmentEntry {
  const prop = Array.isArray(r.properties) ? r.properties[0] : r.properties
  const addr = prop?.property_addresses
  const addrObj = Array.isArray(addr) ? addr[0] : addr
  return {
    id: r.id,
    property_id: r.property_id,
    title: r.title,
    description: r.description,
    start_at: r.start_at,
    end_at: r.end_at,
    client_name: r.client_name,
    client_email: r.client_email,
    client_phone: r.client_phone,
    location: r.location,
    propertyDisplayName: prop?.display_name ?? null,
    propertyAddress: addrObj?.normalized_full_address ?? null,
  }
}

export async function getAppointments(opts?: {
  from?: string
  to?: string
  propertyId?: string
  limit?: number
}): Promise<{ data: AppointmentEntry[]; error: string | null }> {
  try {
    const supabase = createServerClient()
    const ownerUserId = await getOwnerUserId(supabase)

    const from =
      opts?.from ??
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const to =
      opts?.to ??
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

    let query = supabase
      .from("appointments")
      .select(
        `id, property_id, title, description,
         start_at, end_at,
         client_name, client_email, client_phone, location,
         properties ( display_name, property_addresses ( normalized_full_address ) )`
      )
      .eq("user_id", ownerUserId)
      .gte("start_at", from)
      .lte("start_at", to)
      .order("start_at", { ascending: true })

    if (opts?.propertyId) {
      query = query.eq("property_id", opts.propertyId)
    }
    if (opts?.limit) {
      query = query.limit(opts.limit)
    }

    const { data, error } = await query
    if (error) return { data: [], error: error.message }

    return {
      data: ((data as unknown[]) ?? []).map((r) => parseRaw(r as RawAppointment)),
      error: null,
    }
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load appointments.",
    }
  }
}

