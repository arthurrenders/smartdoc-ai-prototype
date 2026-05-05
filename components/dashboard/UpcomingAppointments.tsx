"use client"

import { useState } from "react"
import Link from "next/link"
import { CalendarDays, ChevronDown, ChevronUp, Clock, User, Plus } from "lucide-react"
import type { AppointmentEntry } from "@/app/actions/get-appointments"
import type { PropertyOption } from "@/lib/app-types"
import { AppointmentModal } from "@/components/dashboard/AppointmentModal"
import { formatTimeRange, formatDateNl } from "@/lib/date-formatting"

const VISIBLE_LIMIT = 5

type Props = {
  rows: AppointmentEntry[]
  error: string | null
  properties: PropertyOption[]
}

export function UpcomingAppointments({ rows, error, properties }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  const hasMore = rows.length > VISIBLE_LIMIT
  const visible = expanded ? rows : rows.slice(0, VISIBLE_LIMIT)
  const hiddenCount = rows.length - VISIBLE_LIMIT

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="dashboard-section-title">
            <CalendarDays className="h-5 w-5" aria-hidden />
            Aankomende afspraken
          </h2>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-dashboard-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Afspraak
          </button>
        </div>

        {error && (
          <div
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            Afspraken konden niet geladen worden: {error}
          </div>
        )}

        {!error && rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-dashboard-outline-variant/40 bg-dashboard-surface px-6 py-8 text-center">
            <p className="text-sm text-dashboard-on-surface-variant">
              Geen aankomende afspraken.
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Eerste afspraak plannen
            </button>
          </div>
        ) : (
          <div className="rounded-xl bg-dashboard-surface-low p-1.5">
            <ul className="space-y-2">
              {visible.map((row) => (
                <li key={row.id}>
                  <div className="flex items-start gap-3 rounded-lg border border-dashboard-outline-variant/20 bg-dashboard-surface p-3 text-sm shadow-sm">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                      <CalendarDays className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-semibold text-dashboard-on-surface">{row.title}</p>
                      <p className="flex items-center gap-1 text-xs text-dashboard-on-surface-variant">
                        <Clock className="h-3 w-3 shrink-0" aria-hidden />
                        {formatDateNl(row.start_at)} · {formatTimeRange(row.start_at, row.end_at)}
                      </p>
                      {row.client_name && (
                        <p className="flex items-center gap-1 text-xs text-dashboard-on-surface-variant">
                          <User className="h-3 w-3 shrink-0" aria-hidden />
                          {row.client_name}
                        </p>
                      )}
                      {row.property_id && (
                        <Link
                          href={`/properties/${row.property_id}`}
                          className="text-xs text-blue-600 underline-offset-2 hover:underline"
                        >
                          {row.propertyDisplayName ?? `Pand ${row.property_id.slice(0, 8)}…`}
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {hasMore && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold text-dashboard-on-surface-variant transition-colors hover:bg-dashboard-surface hover:text-dashboard-primary"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Minder tonen
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    {hiddenCount} meer tonen
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      <AppointmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        properties={properties}
      />
    </>
  )
}

