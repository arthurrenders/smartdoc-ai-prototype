"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, CalendarDays, MapPin } from "lucide-react"
import type { CalendarDateEntry } from "@/app/actions/get-calendar-dates"
import {
  maxUrgency,
  urgencyBadgeClass,
  urgencyDayCellClass,
  urgencyForDocumentDate,
  type UrgencyLevel,
} from "@/lib/calendar-urgency"

const WEEKDAYS = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"]

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function isoFromYmd(y: number, m0: number, d: number): string {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`
}

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
    case "critical":
      return "Urgent"
    case "warning":
      return "Let op"
    case "info":
      return "Informatief"
    default:
      return "Verleden"
  }
}

function formatDateLongNl(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

type Props = {
  entries: CalendarDateEntry[]
  /** Placeholder link until /map is implemented */
  mapHref?: string
}

export function DocumentCalendar({ entries, mapHref }: Props) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getUTCFullYear())
  const [viewMonth, setViewMonth] = useState(now.getUTCMonth())
  const [selectedIso, setSelectedIso] = useState<string | null>(null)

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarDateEntry[]>()
    for (const e of entries) {
      const key = e.date_on.slice(0, 10)
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    return map
  }, [entries])

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])

  const monthTitle = new Date(Date.UTC(viewYear, viewMonth, 1)).toLocaleDateString("nl-BE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  function goPrevMonth() {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1)
        return 11
      }
      return m - 1
    })
    setSelectedIso(null)
  }

  function goNextMonth() {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1)
        return 0
      }
      return m + 1
    })
    setSelectedIso(null)
  }

  function onDayClick(day: number | null) {
    if (day == null) {
      setSelectedIso(null)
      return
    }
    const iso = isoFromYmd(viewYear, viewMonth, day)
    const list = byDate.get(iso)
    if (!list?.length) {
      setSelectedIso(null)
      return
    }
    setSelectedIso((prev) => (prev === iso ? null : iso))
  }

  const selectedEvents = selectedIso ? byDate.get(selectedIso) ?? [] : []

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashboard-outline-variant/30 bg-dashboard-surface p-6 shadow-sm">
        <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h2 className="dashboard-section-title">
            <CalendarDays className="h-5 w-5" aria-hidden />
            Document Calendar
          </h2>
          {mapHref ? (
            <Link
              href={mapHref}
              className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-dashboard-outline-variant/40 bg-white px-3 py-2 text-sm text-dashboard-primary transition-all hover:bg-dashboard-surface-low sm:w-auto"
            >
              <MapPin className="h-4 w-4" aria-hidden />
              Map view
            </Link>
          ) : null}
        </div>
        <div className="rounded-xl border border-dashed border-dashboard-outline-variant/40 bg-dashboard-surface-low px-6 py-10 text-center">
          <CalendarDays className="h-12 w-12 sm:h-14 sm:w-14 saas-empty-state-icon" aria-hidden />
          <p className="mt-4 text-base font-semibold text-dashboard-on-surface">Nog geen datums</p>
          <p className="mt-2 text-sm text-dashboard-on-surface-variant">
            Na een geslaagde documentanalyse verschijnen belangrijke datums hier automatisch.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-dashboard-outline-variant/30 bg-dashboard-surface p-6 shadow-sm">
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="dashboard-section-title">
          <CalendarDays className="h-5 w-5" aria-hidden />
          Document Calendar
        </h2>
        {mapHref ? (
          <Link
            href={mapHref}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-dashboard-outline-variant/40 bg-white px-3 py-2 text-sm text-dashboard-primary transition-all hover:bg-dashboard-surface-low sm:w-auto"
          >
            <MapPin className="h-4 w-4" aria-hidden />
            Map view
          </Link>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
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
        <div className="flex flex-wrap gap-3 text-xs text-dashboard-on-surface-variant">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Urgent (verval)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Waarschuwing
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--brand-dark))]" /> Overig
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[280px]">
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-dashboard-on-surface-variant">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
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
                const levels = list.map((e) => urgencyForDocumentDate(e.date_type, e.date_on))
                const cellUrgency = maxUrgency(levels)
                const selected = selectedIso === iso

                return (
                  <div key={iso} className="aspect-square p-0.5">
                    <button
                      type="button"
                      onClick={() => onDayClick(day)}
                      disabled={!has}
                      className={[
                        "flex h-full w-full flex-col items-center justify-center rounded-lg border text-xs font-medium transition-colors",
                        has
                          ? `${urgencyDayCellClass(cellUrgency)} cursor-pointer hover:opacity-90`
                          : "border-transparent text-dashboard-on-surface-variant/50 hover:bg-dashboard-surface-low",
                        selected && has ? "ring-2 ring-dashboard-primary ring-offset-2 ring-offset-dashboard-surface" : "",
                        !has ? "cursor-default opacity-80" : "",
                      ].join(" ")}
                    >
                      <span>{day}</span>
                      {has ? (
                        <span className="mt-0.5 flex gap-0.5" aria-hidden>
                          {list.slice(0, 3).map((e) => (
                            <span
                              key={e.id}
                              className="h-1 w-1 rounded-full bg-current opacity-70"
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

      {selectedIso && selectedEvents.length > 0 ? (
        <div
          className="mt-6 rounded-xl border border-dashboard-outline-variant/30 bg-dashboard-surface-low p-5 shadow-sm"
          role="region"
          aria-label="Geselecteerde dag"
        >
          <p className="text-base font-bold text-dashboard-on-surface">
            {formatDateLongNl(selectedIso)}
          </p>
          <ul className="mt-4 space-y-3">
            {selectedEvents.map((e) => {
              const u = urgencyForDocumentDate(e.date_type, e.date_on)
              const propName =
                e.propertyDisplayName?.trim() || `Pand ${e.property_id.slice(0, 8)}…`
              return (
                <li
                  key={e.id}
                  className="rounded-xl border border-dashboard-outline-variant/30 bg-dashboard-surface p-4 text-sm shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/properties/${e.property_id}`}
                        className="font-medium text-dashboard-primary underline-offset-2 hover:underline"
                      >
                        {propName}
                      </Link>
                      <p className="mt-1 text-dashboard-on-surface-variant">
                        Document:{" "}
                        <span className="text-dashboard-on-surface">
                          {e.documentTypeName ?? "Onbekend type"}
                        </span>
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
                    <span
                      className={`saas-badge shrink-0 ${urgencyBadgeClass(u)}`}
                    >
                      {urgencyLabelNl(u)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
