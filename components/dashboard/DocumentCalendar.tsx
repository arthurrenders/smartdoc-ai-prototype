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
      <div className="saas-card">
        <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h2 className="saas-section-heading inline-flex items-center gap-2 text-xl sm:text-2xl">
            <CalendarDays className="h-5 w-5 text-brand-dark dark:text-brand-light" aria-hidden />
            Documentkalender
          </h2>
          {mapHref ? (
            <Link
              href={mapHref}
              className="saas-btn-secondary inline-flex w-full shrink-0 items-center justify-center gap-2 sm:w-auto"
            >
              <MapPin className="h-4 w-4" aria-hidden />
              Kaartweergave
            </Link>
          ) : null}
        </div>
        <p className="saas-section-subheading mb-6">
          Datums uit geanalyseerde documenten (certificaat, verval, keuring)
        </p>
        <div className="saas-empty-state py-10">
          <CalendarDays className="h-12 w-12 sm:h-14 sm:w-14 saas-empty-state-icon" aria-hidden />
          <p className="saas-empty-state-title">Nog geen datums</p>
          <p className="saas-empty-state-description">
            Na een geslaagde documentanalyse verschijnen belangrijke datums hier automatisch.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="saas-card">
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="saas-section-heading inline-flex items-center gap-2 text-xl sm:text-2xl">
          <CalendarDays className="h-5 w-5 text-brand-dark dark:text-brand-light" aria-hidden />
          Documentkalender
        </h2>
        {mapHref ? (
          <Link
            href={mapHref}
            className="saas-btn-secondary inline-flex w-full shrink-0 items-center justify-center gap-2 sm:w-auto"
          >
            <MapPin className="h-4 w-4" aria-hidden />
            Kaartweergave
          </Link>
        ) : null}
      </div>
      <p className="saas-section-subheading mb-4">
        Klik op een gemarkeerde dag om pand, documenttype en datumsoort te zien.
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrevMonth}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-white text-foreground shadow-sm transition-all duration-200 hover:bg-gray-50 dark:bg-background dark:hover:bg-muted"
            aria-label="Vorige maand"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[10rem] text-center text-sm font-semibold capitalize text-foreground">
            {monthTitle}
          </span>
          <button
            type="button"
            onClick={goNextMonth}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-white text-foreground shadow-sm transition-all duration-200 hover:bg-gray-50 dark:bg-background dark:hover:bg-muted"
            aria-label="Volgende maand"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
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
                        "flex h-full w-full flex-col items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                        has
                          ? `${urgencyDayCellClass(cellUrgency)} cursor-pointer hover:opacity-90`
                          : "border-transparent text-muted-foreground hover:bg-muted/50",
                        selected && has ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "",
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
          className="mt-8 rounded-2xl border border-[hsl(var(--border))] bg-slate-50/80 p-5 shadow-sm dark:bg-muted/30"
          role="region"
          aria-label="Geselecteerde dag"
        >
          <p className="text-base font-bold text-foreground">
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
                  className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 text-sm shadow-sm transition-shadow duration-200 hover:shadow-md dark:bg-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link
                        href={`/properties/${e.property_id}`}
                        className="font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {propName}
                      </Link>
                      <p className="mt-1 text-muted-foreground">
                        Document:{" "}
                        <span className="text-foreground">
                          {e.documentTypeName ?? "Onbekend type"}
                        </span>
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        Soort:{" "}
                        <span className="text-foreground">{dateTypeLabelNl(e.date_type)}</span>
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        Datum:{" "}
                        <span className="font-medium text-foreground">{e.date_on}</span>
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
