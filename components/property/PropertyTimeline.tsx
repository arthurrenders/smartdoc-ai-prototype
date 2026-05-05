"use client"

import { useState } from "react"
import { FileText, CalendarDays, CalendarClock, AlertTriangle, Clock, User, Phone, Mail, MapPinned, Pencil } from "lucide-react"
import type { TimelineEvent } from "@/app/actions/get-property-timeline"
import { AppointmentModal } from "@/components/dashboard/AppointmentModal"
import { urgencyForDocumentDate, urgencyBadgeClass } from "@/lib/calendar-urgency"
import type { AppointmentEntry } from "@/app/actions/get-appointments"
import type { PropertyOption } from "@/lib/app-types"
import { formatDateNl } from "@/lib/date-formatting"

type Props = {
  events: TimelineEvent[]
  propertyId: string
  properties: PropertyOption[]
  error: string | null
}

const HISTORY_CUTOFF_DAYS = 90

function isOld(date: string): boolean {
  const todayMs = Date.now()
  const eventMs = new Date(date + "T00:00:00Z").getTime()
  return todayMs - eventMs > HISTORY_CUTOFF_DAYS * 24 * 60 * 60 * 1000
}

function DeadlineIcon({ dateType, date }: { dateType: string; date: string }) {
  const urgency = urgencyForDocumentDate(dateType, date)
  if (urgency === "critical") return <AlertTriangle className="h-3.5 w-3.5" />
  return <CalendarClock className="h-3.5 w-3.5" />
}

function deadlineCircleClass(dateType: string, date: string): string {
  const urgency = urgencyForDocumentDate(dateType, date)
  switch (urgency) {
    case "critical": return "bg-red-100 text-red-600"
    case "warning": return "bg-amber-100 text-amber-600"
    default: return "bg-blue-50 text-blue-500"
  }
}

function deadlineDateBadge(dateType: string, date: string): string {
  const urgency = urgencyForDocumentDate(dateType, date)
  return urgencyBadgeClass(urgency)
}

export function PropertyTimeline({ events, propertyId, properties, error }: Props) {
  const [showHistory, setShowHistory] = useState(false)
  const [editTarget, setEditTarget] = useState<AppointmentEntry | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        Tijdlijn kon niet geladen worden: {error}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-dashboard-outline-variant/40 bg-dashboard-surface px-6 py-10 text-center">
        <p className="text-sm text-dashboard-on-surface-variant">Nog geen activiteit voor dit pand.</p>
      </div>
    )
  }

  const oldEvents = events.filter((e) => isOld(e.date))
  const recentEvents = events.filter((e) => !isOld(e.date))
  const hiddenCount = oldEvents.length
  const visibleEvents = showHistory ? events : recentEvents

  function openEdit(event: TimelineEvent & { kind: "appointment" }) {
    const apt: AppointmentEntry = {
      id: event.id,
      property_id: event.propertyId,
      title: event.title,
      description: event.description,
      start_at: event.startAt,
      end_at: event.endAt,
      client_name: event.clientName,
      client_email: event.clientEmail,
      client_phone: event.clientPhone,
      location: event.location,
      propertyDisplayName: null,
      propertyAddress: null,
    }
    setEditTarget(apt)
    setModalOpen(true)
  }

  return (
    <>
      <div className="relative ml-4 border-l-2 border-dashboard-outline-variant/30">
        {visibleEvents.map((event, i) => {
          if (event.kind === "document") {
            return (
              <div key={`doc-${event.id}-${i}`} className="relative mb-6 pl-8">
                <div className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600 ring-2 ring-white">
                  <FileText className="h-3.5 w-3.5" />
                </div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-dashboard-on-surface">
                      {event.docTypeName ?? "Document"} geüpload
                    </p>
                    <p className="mt-0.5 truncate text-xs text-dashboard-on-surface-variant">
                      {event.filename}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {formatDateNl(event.date)}
                  </span>
                </div>
              </div>
            )
          }

          if (event.kind === "appointment") {
            return (
              <div key={`apt-${event.id}-${i}`} className="relative mb-6 pl-8">
                <div className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 ring-2 ring-white">
                  <CalendarDays className="h-3.5 w-3.5" />
                </div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-dashboard-on-surface">{event.title}</p>
                    {event.timeRange && (
                      <p className="flex items-center gap-1 text-xs text-dashboard-on-surface-variant">
                        <Clock className="h-3 w-3 shrink-0" />
                        {event.timeRange}
                      </p>
                    )}
                    {event.clientName && (
                      <p className="flex items-center gap-1 text-xs text-dashboard-on-surface-variant">
                        <User className="h-3 w-3 shrink-0" />
                        {event.clientName}
                      </p>
                    )}
                    {event.clientPhone && (
                      <p className="flex items-center gap-1 text-xs text-dashboard-on-surface-variant">
                        <Phone className="h-3 w-3 shrink-0" />
                        <a href={`tel:${event.clientPhone}`} className="hover:underline">{event.clientPhone}</a>
                      </p>
                    )}
                    {event.clientEmail && (
                      <p className="flex items-center gap-1 text-xs text-dashboard-on-surface-variant">
                        <Mail className="h-3 w-3 shrink-0" />
                        <a href={`mailto:${event.clientEmail}`} className="hover:underline">{event.clientEmail}</a>
                      </p>
                    )}
                    {event.location && (
                      <p className="flex items-center gap-1 text-xs text-dashboard-on-surface-variant">
                        <MapPinned className="h-3 w-3 shrink-0" />
                        {event.location}
                      </p>
                    )}
                    {event.description && (
                      <p className="mt-1 text-xs italic text-dashboard-on-surface-variant">
                        {event.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      {formatDateNl(event.date)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openEdit(event)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-blue-200 bg-white text-blue-600 hover:bg-blue-50"
                      aria-label="Bewerken"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            )
          }

          // Deadline
          return (
            <div key={`dl-${event.id}-${i}`} className="relative mb-6 pl-8">
              <div className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white ${deadlineCircleClass(event.dateType, event.date)}`}>
                <DeadlineIcon dateType={event.dateType} date={event.date} />
              </div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-dashboard-on-surface">
                    {event.labelDisplay}
                    {event.documentTypeName ? ` — ${event.documentTypeName}` : ""}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${deadlineDateBadge(event.dateType, event.date)}`}>
                  {formatDateNl(event.date)}
                </span>
              </div>
            </div>
          )
        })}

        {!showHistory && hiddenCount > 0 && (
          <div className="relative mb-2 pl-8">
            <div className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-50 text-slate-400 ring-2 ring-white">
              <span className="text-[9px] font-bold">+{hiddenCount}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="text-xs font-semibold text-dashboard-primary underline-offset-2 hover:underline"
            >
              {hiddenCount} ouder{hiddenCount === 1 ? " item" : "e items"} tonen
            </button>
          </div>
        )}

        {showHistory && hiddenCount > 0 && (
          <div className="relative mb-2 pl-8">
            <button
              type="button"
              onClick={() => setShowHistory(false)}
              className="text-xs text-dashboard-on-surface-variant underline-offset-2 hover:underline"
            >
              Geschiedenis verbergen
            </button>
          </div>
        )}
      </div>

      <AppointmentModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditTarget(null) }}
        editAppointment={editTarget}
        properties={properties}
      />
    </>
  )
}

