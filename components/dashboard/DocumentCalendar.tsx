"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  Clock,
  User,
  Phone,
  Mail,
  MapPinned,
  ExternalLink,
} from "lucide-react"
import type { CalendarDateEntry } from "@/app/actions/get-calendar-dates"
import type { AppointmentEntry } from "@/app/actions/get-appointments"
import type { PropertyOption } from "@/lib/app-types"
import { deleteAppointment } from "@/app/actions/delete-appointment"
import { pad2, isoFromYmd, formatTimeRange, formatDateNl } from "@/lib/date-formatting"
import {
  maxUrgency,
  urgencyBadgeClass,
  urgencyDayCellClass,
  urgencyForDocumentDate,
  appointmentDayCellClass,
  appointmentBadgeClass,
  mixedDayCellClass,
  type UrgencyLevel,
} from "@/lib/calendar-urgency"
import { AppointmentModal } from "@/components/dashboard/AppointmentModal"

type Filter = "all" | "deadlines" | "appointments"

type DeadlineEvent = CalendarDateEntry & { kind: "deadline" }
type AppointmentCalEvent = AppointmentEntry & { kind: "appointment" }
type CalendarEvent = DeadlineEvent | AppointmentCalEvent

function gcalLink(appt: AppointmentCalEvent): string {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").slice(0, 15)
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: appt.title,
    dates: `${fmt(appt.start_at)}/${fmt(appt.end_at)}`,
  })
  if (appt.location) params.set("location", appt.location)
  if (appt.description) params.set("details", appt.description)
  return `https://calendar.google.com/calendar/render?${params}`
}

const WEEKDAYS = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"]

function buildMonthGrid(year: number, month0: number): (number | null)[][] {
  const first = new Date(Date.UTC(year, month0, 1))
  const startPad = first.getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  while (cells.length < 42) cells.push(null)
  const rows: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
  return rows
}

function dateTypeLabelNl(dateType: string): string {
  const t = dateType.toLowerCase()
  if (t === "expiry") return "Vervaldatum"
  if (t === "certificate") return "Certificaatdatum"
  if (t === "inspection") return "Keuringsdatum"
  return dateType
}

function urgencyLabelNl(level: UrgencyLevel): string {
  switch (level) {
    case "critical": return "Urgent"
    case "warning": return "Let op"
    case "info": return "Informatief"
    default: return "Verleden"
  }
}

type Props = {
  entries: CalendarDateEntry[]
  appointments: AppointmentEntry[]
  properties: PropertyOption[]
  mapHref?: string
}

export function DocumentCalendar({ entries, appointments, properties, mapHref }: Props) {
  const router = useRouter()
  const now = new Date()
  const todayIso = now.toISOString().slice(0, 10)

  const [viewYear, setViewYear] = useState(now.getUTCFullYear())
  const [viewMonth, setViewMonth] = useState(now.getUTCMonth())
  const [selectedIso, setSelectedIso] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createModalDate, setCreateModalDate] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<AppointmentEntry | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPendingDelete, startDeleteTransition] = useTransition()

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    if (filter !== "appointments") {
      for (const e of entries) {
        const key = e.date_on.slice(0, 10)
        const list = map.get(key) ?? []
        list.push({ kind: "deadline", ...e })
        map.set(key, list)
      }
    }
    if (filter !== "deadlines") {
      for (const a of appointments) {
        const key = a.start_at.slice(0, 10)
        const list = map.get(key) ?? []
        list.push({ kind: "appointment", ...a })
        map.set(key, list)
      }
    }
    return map
  }, [entries, appointments, filter])

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])

  const monthTitle = new Date(Date.UTC(viewYear, viewMonth, 1)).toLocaleDateString("nl-BE", {
    month: "long", year: "numeric", timeZone: "UTC",
  })

  function goPrevMonth() {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11 }
      return m - 1
    })
    setSelectedIso(null)
  }

  function goNextMonth() {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0 }
      return m + 1
    })
    setSelectedIso(null)
  }

  function onDayClick(day: number | null) {
    if (day == null) return
    const iso = isoFromYmd(viewYear, viewMonth, day)
    const list = byDate.get(iso)
    if (list?.length) {
      setSelectedIso((prev) => (prev === iso ? null : iso))
    } else if (filter !== "deadlines") {
      setCreateModalDate(iso)
      setCreateModalOpen(true)
    }
  }

  function openCreateModal() {
    setCreateModalDate(null)
    setEditTarget(null)
    setCreateModalOpen(true)
  }

  function openEditModal(apt: AppointmentEntry) {
    setEditTarget(apt)
    setCreateModalOpen(true)
  }

  function handleModalClose() {
    setCreateModalOpen(false)
    setEditTarget(null)
    setCreateModalDate(null)
  }

  function handleDelete(id: string) {
    if (!confirm("Afspraak verwijderen? Dit kan niet ongedaan worden.")) return
    setDeletingId(id)
    startDeleteTransition(async () => {
      await deleteAppointment(id)
      setDeletingId(null)
      setSelectedIso(null)
      router.refresh()
    })
  }

  function getDayCellClass(list: CalendarEvent[]): string {
    const hasDeadlines = list.some((e) => e.kind === "deadline")
    const hasAppointments = list.some((e) => e.kind === "appointment")
    if (hasDeadlines && hasAppointments) return mixedDayCellClass()
    if (hasAppointments) return appointmentDayCellClass()
    const levels = list
      .filter((e): e is DeadlineEvent => e.kind === "deadline")
      .map((e) => urgencyForDocumentDate(e.date_type, e.date_on))
    return urgencyDayCellClass(maxUrgency(levels))
  }

  const selectedEvents = selectedIso ? (byDate.get(selectedIso) ?? []) : []
  const isEmpty = entries.length === 0 && appointments.length === 0

  const FilterPill = ({ value, label }: { value: Filter; label: string }) => (
    <button
      type="button"
      onClick={() => { setFilter(value); setSelectedIso(null) }}
      className={[
        "px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg",
        filter === value
          ? "bg-dashboard-primary text-white"
          : "bg-white text-dashboard-on-surface-variant hover:bg-dashboard-surface-low",
      ].join(" ")}
    >
      {label}
    </button>
  )

  if (isEmpty) {
    return (
      <div className="rounded-xl border border-dashboard-outline-variant/30 bg-dashboard-surface p-6 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h2 className="dashboard-section-title">
            <CalendarDays className="h-5 w-5" aria-hidden />
            Kalender
          </h2>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-dashboard-primary px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 sm:w-auto"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Afspraak
          </button>
        </div>
        <div className="rounded-xl border border-dashed border-dashboard-outline-variant/40 bg-dashboard-surface-low px-6 py-10 text-center">
          <CalendarDays className="h-12 w-12 sm:h-14 sm:w-14 saas-empty-state-icon" aria-hidden />
          <p className="mt-4 text-base font-semibold text-dashboard-on-surface">Nog geen datums</p>
          <p className="mt-2 text-sm text-dashboard-on-surface-variant">
            Na een geslaagde documentanalyse verschijnen deadlines hier automatisch. Afspraken voeg
            je handmatig toe.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-dashboard-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Eerste afspraak plannen
          </button>
        </div>
        <AppointmentModal
          open={createModalOpen}
          onClose={handleModalClose}
          defaultDate={createModalDate}
          editAppointment={editTarget}
          properties={properties}
        />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-dashboard-outline-variant/30 bg-dashboard-surface p-6 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="dashboard-section-title">
          <CalendarDays className="h-5 w-5" aria-hidden />
          Kalender
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-dashboard-primary px-3 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Afspraak
          </button>
        </div>
      </div>

      {/* Nav + Filter */}
      <div className="mb-4 flex flex-col items-center justify-center gap-3">
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={goPrevMonth}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-dashboard-outline-variant/40 bg-white text-dashboard-on-surface shadow-sm transition-all hover:bg-dashboard-surface-low"
            aria-label="Vorige maand"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[10rem] text-center text-sm font-semibold capitalize text-dashboard-on-surface">
            {monthTitle}
          </span>
          <button
            type="button"
            onClick={goNextMonth}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-dashboard-outline-variant/40 bg-white text-dashboard-on-surface shadow-sm transition-all hover:bg-dashboard-surface-low"
            aria-label="Volgende maand"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Filter toggle */}
        <div className="flex overflow-hidden rounded-lg border border-dashboard-outline-variant/40">
          <FilterPill value="all" label="Alles" />
          <FilterPill value="deadlines" label="Deadlines" />
          <FilterPill value="appointments" label="Afspraken" />
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap gap-3 text-xs text-dashboard-on-surface-variant">
        {filter !== "appointments" && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Urgent (verval)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Waarschuwing
            </span>
          </>
        )}
        {filter !== "deadlines" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Afspraak
          </span>
        )}
        {filter === "all" && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> Gemengd
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--brand-dark))]" /> Overig
        </span>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto px-1 py-1">
        <div className="min-w-[280px]">
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-dashboard-on-surface-variant">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          {grid.map((row, ri) => (
            <div key={ri} className="grid grid-cols-7 gap-1">
              {row.map((day, ci) => {
                if (day === null) {
                  return <div key={`e-${ri}-${ci}`} className="aspect-square p-0.5" />
                }
                const iso = isoFromYmd(viewYear, viewMonth, day)
                const list = byDate.get(iso) ?? []
                const has = list.length > 0
                const isToday = iso === todayIso
                const selected = selectedIso === iso
                const canClick = has || filter !== "deadlines"

                const deadlineDots = list
                  .filter((e): e is DeadlineEvent => e.kind === "deadline")
                  .slice(0, 3)
                const apptDots = list
                  .filter((e): e is AppointmentCalEvent => e.kind === "appointment")
                  .slice(0, 3)
                const allDots = [...deadlineDots, ...apptDots].slice(0, 3)

                return (
                  <div key={iso} className="aspect-square p-0.5">
                    <button
                      type="button"
                      onClick={() => onDayClick(day)}
                      disabled={!canClick}
                      className={[
                        "flex h-full w-full flex-col items-center justify-center rounded-lg border text-xs font-medium transition-colors",
                        has
                          ? `${getDayCellClass(list)} cursor-pointer hover:opacity-90`
                          : canClick
                            ? "border-dashed border-dashboard-outline-variant/30 text-dashboard-on-surface-variant/40 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                            : "border-transparent text-dashboard-on-surface-variant/50 cursor-default opacity-80",
                        selected && has
                          ? "ring-2 ring-dashboard-primary ring-offset-2 ring-offset-dashboard-surface"
                          : "",
                        isToday && !selected
                          ? "ring-2 ring-blue-300 ring-offset-1 ring-offset-dashboard-surface"
                          : "",
                      ].join(" ")}
                    >
                      <span className={isToday ? "font-bold" : ""}>{day}</span>
                      {allDots.length > 0 ? (
                        <span className="mt-0.5 flex gap-0.5" aria-hidden>
                          {allDots.map((e, idx) => (
                            <span
                              key={idx}
                              className={[
                                "h-1 w-1 rounded-full opacity-80",
                                e.kind === "appointment" ? "bg-blue-500" : "bg-current",
                              ].join(" ")}
                            />
                          ))}
                        </span>
                      ) : null}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      {selectedIso && selectedEvents.length > 0 ? (
        <div
          className="mt-6 rounded-xl border border-dashboard-outline-variant/30 bg-dashboard-surface-low p-5 shadow-sm"
          role="region"
          aria-label="Geselecteerde dag"
        >
          <p className="text-base font-bold text-dashboard-on-surface">
            {formatDateNl(selectedIso, { long: true })}
          </p>
          <ul className="mt-4 space-y-3">
            {selectedEvents.map((e, idx) => {
              if (e.kind === "deadline") {
                const u = urgencyForDocumentDate(e.date_type, e.date_on)
                const propName =
                  e.propertyDisplayName?.trim() || `Pand ${e.property_id.slice(0, 8)}…`
                return (
                  <li
                    key={e.id}
                    className="rounded-xl border border-dashboard-outline-variant/30 bg-dashboard-surface p-4 text-sm shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                          Deadline
                        </div>
                        <Link
                          href={`/properties/${e.property_id}`}
                          className="block font-medium text-dashboard-primary underline-offset-2 hover:underline"
                        >
                          {propName}
                        </Link>
                        <p className="mt-1 text-dashboard-on-surface-variant">
                          Document:{" "}
                          <span className="text-dashboard-on-surface">{e.documentTypeName ?? "Onbekend type"}</span>
                        </p>
                        <p className="mt-0.5 text-dashboard-on-surface-variant">
                          Soort:{" "}
                          <span className="text-dashboard-on-surface">{dateTypeLabelNl(e.date_type)}</span>
                        </p>
                        <p className="mt-0.5 text-dashboard-on-surface-variant">
                          Datum:{" "}
                          <span className="font-medium text-dashboard-on-surface">{e.date_on}</span>
                        </p>
                      </div>
                      <span className={`saas-badge shrink-0 ${urgencyBadgeClass(u)}`}>
                        {urgencyLabelNl(u)}
                      </span>
                    </div>
                  </li>
                )
              }

              // Appointment
              const isDeleting = isPendingDelete && deletingId === e.id
              return (
                <li
                  key={e.id}
                  className="rounded-xl border border-blue-200/60 bg-blue-50/50 p-4 text-sm shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                        Afspraak
                      </div>
                      <p className="font-semibold text-dashboard-on-surface">{e.title}</p>
                      <p className="flex items-center gap-1.5 text-dashboard-on-surface-variant">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {formatTimeRange(e.start_at, e.end_at)}
                      </p>
                      {e.location && (
                        <p className="flex items-center gap-1.5 text-dashboard-on-surface-variant">
                          <MapPinned className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {e.location}
                        </p>
                      )}
                      {e.client_name && (
                        <p className="flex items-center gap-1.5 text-dashboard-on-surface-variant">
                          <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {e.client_name}
                        </p>
                      )}
                      {e.client_phone && (
                        <p className="flex items-center gap-1.5 text-dashboard-on-surface-variant">
                          <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <a href={`tel:${e.client_phone}`} className="hover:underline">
                            {e.client_phone}
                          </a>
                        </p>
                      )}
                      {e.client_email && (
                        <p className="flex items-center gap-1.5 text-dashboard-on-surface-variant">
                          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <a href={`mailto:${e.client_email}`} className="hover:underline">
                            {e.client_email}
                          </a>
                        </p>
                      )}
                      {e.property_id && (
                        <Link
                          href={`/properties/${e.property_id}`}
                          className="block text-blue-600 underline-offset-2 hover:underline"
                        >
                          {e.propertyDisplayName ?? `Pand ${e.property_id.slice(0, 8)}…`}
                        </Link>
                      )}
                      {e.description && (
                        <p className="mt-1 rounded-md bg-white/60 px-2 py-1.5 text-xs italic text-dashboard-on-surface-variant">
                          {e.description}
                        </p>
                      )}
                      <a
                        href={gcalLink(e)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 underline-offset-2 hover:text-blue-600 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden />
                        Toevoegen aan Google Calendar
                      </a>
                    </div>

                    {/* Edit / delete */}
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <span className={`saas-badge shrink-0 ${appointmentBadgeClass()}`}>
                        Afspraak
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(e)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-blue-200 bg-white text-blue-600 hover:bg-blue-50"
                          aria-label="Bewerken"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(e.id)}
                          disabled={isDeleting}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-white text-red-500 hover:bg-red-50 disabled:opacity-50"
                          aria-label="Verwijderen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Quick add appointment for selected date */}
          {filter !== "deadlines" && (
            <button
              type="button"
              onClick={() => {
                setCreateModalDate(selectedIso)
                setEditTarget(null)
                setCreateModalOpen(true)
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-50"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Afspraak toevoegen op deze dag
            </button>
          )}
        </div>
      ) : null}

      {/* Appointment modal (create + edit) */}
      <AppointmentModal
        open={createModalOpen}
        onClose={handleModalClose}
        defaultDate={createModalDate}
        editAppointment={editTarget}
        properties={properties}
      />
    </div>
  )
}
