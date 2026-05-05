"use client"

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { X, AlertTriangle } from "lucide-react"
import type { AppointmentEntry } from "@/app/actions/get-appointments"
import type { PropertyOption } from "@/lib/app-types"
import { createAppointment } from "@/app/actions/create-appointment"
import { updateAppointment } from "@/app/actions/update-appointment"

type Props = {
  open: boolean
  onClose: () => void
  defaultDate?: string | null
  editAppointment?: AppointmentEntry | null
  properties: PropertyOption[]
}

function extractDate(iso: string): string {
  return iso.slice(0, 10)
}

function extractTime(iso: string): string {
  const m = iso.match(/T(\d{2}:\d{2})/)
  return m ? m[1] : "00:00"
}

export function AppointmentModal({
  open,
  onClose,
  defaultDate,
  editAppointment,
  properties,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [conflictTitle, setConflictTitle] = useState<string | null>(null)
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const isEdit = !!editAppointment
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (open) {
      setError(null)
      setConflictTitle(null)
      setPendingFormData(null)
    }
  }, [open])

  if (!open) return null

  function getDefaultValues() {
    if (editAppointment) {
      return {
        title: editAppointment.title,
        date: extractDate(editAppointment.start_at),
        start_time: extractTime(editAppointment.start_at),
        end_time: extractTime(editAppointment.end_at),
        property_id: editAppointment.property_id ?? "",
        location: editAppointment.location ?? "",
        client_name: editAppointment.client_name ?? "",
        client_email: editAppointment.client_email ?? "",
        client_phone: editAppointment.client_phone ?? "",
        description: editAppointment.description ?? "",
      }
    }
    return {
      title: "",
      date: defaultDate ?? today,
      start_time: "09:00",
      end_time: "10:00",
      property_id: "",
      location: "",
      client_name: "",
      client_email: "",
      client_phone: "",
      description: "",
    }
  }

  const defaults = getDefaultValues()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setConflictTitle(null)

    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      const result = isEdit
        ? await updateAppointment(formData)
        : await createAppointment(formData)

      if ("conflict" in result && result.conflict) {
        setConflictTitle(result.conflictTitle)
        setPendingFormData(formData)
        return
      }
      if (!result.ok) {
        setError("error" in result ? result.error : "Onbekende fout.")
        return
      }
      onClose()
      router.refresh()
    })
  }

  async function handleForceConfirm() {
    if (!pendingFormData) return
    setConflictTitle(null)
    setError(null)

    startTransition(async () => {
      const result = isEdit
        ? await updateAppointment(pendingFormData, true)
        : await createAppointment(pendingFormData, true)

      if (!result.ok) {
        setError("error" in result ? result.error : "Onbekende fout.")
        return
      }
      onClose()
      router.refresh()
    })
  }

  const labelClass = "block text-xs font-medium text-dashboard-on-surface-variant mb-1"
  const inputClass =
    "w-full rounded-md border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-dashboard-primary/60 focus:ring-2 focus:ring-dashboard-primary/20 disabled:opacity-50"

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? "Afspraak bewerken" : "Nieuwe afspraak"}
      onClick={onClose}
    >
      <div
        className="relative my-auto flex w-full max-w-lg flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {isEdit ? "Afspraak bewerken" : "Nieuwe afspraak"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isEdit
                ? "Pas de details van de afspraak aan."
                : "Voeg een afspraak toe aan de kalender."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Sluiten"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {isEdit && <input type="hidden" name="id" value={editAppointment!.id} />}

          {/* Title */}
          <div>
            <label htmlFor="apt-title" className={labelClass}>
              Titel <span className="text-destructive">*</span>
            </label>
            <input
              id="apt-title"
              name="title"
              type="text"
              required
              maxLength={120}
              defaultValue={defaults.title}
              disabled={isPending}
              autoFocus
              className={inputClass}
              placeholder="bv. Bezichtiging klant, Notaris afspraak…"
            />
          </div>

          {/* Date + times */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label htmlFor="apt-date" className={labelClass}>
                Datum <span className="text-destructive">*</span>
              </label>
              <input
                id="apt-date"
                name="date"
                type="date"
                required
                defaultValue={defaults.date}
                disabled={isPending}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="apt-start" className={labelClass}>
                Begintijd <span className="text-destructive">*</span>
              </label>
              <input
                id="apt-start"
                name="start_time"
                type="time"
                required
                defaultValue={defaults.start_time}
                disabled={isPending}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="apt-end" className={labelClass}>
                Eindtijd <span className="text-destructive">*</span>
              </label>
              <input
                id="apt-end"
                name="end_time"
                type="time"
                required
                defaultValue={defaults.end_time}
                disabled={isPending}
                className={inputClass}
              />
            </div>
          </div>

          {/* Property */}
          <div>
            <label htmlFor="apt-property" className={labelClass}>
              Pand (optioneel)
            </label>
            <select
              id="apt-property"
              name="property_id"
              defaultValue={defaults.property_id}
              disabled={isPending}
              className={inputClass}
            >
              <option value="">— Geen pand gekoppeld —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name ?? `Pand ${p.id.slice(0, 8)}…`}
                </option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div>
            <label htmlFor="apt-location" className={labelClass}>
              Locatie (optioneel)
            </label>
            <input
              id="apt-location"
              name="location"
              type="text"
              maxLength={200}
              defaultValue={defaults.location}
              disabled={isPending}
              className={inputClass}
              placeholder="bv. Kantoor, Pand adres…"
            />
          </div>

          {/* Client info */}
          <div className="rounded-lg border border-dashboard-outline-variant/30 bg-dashboard-surface-low p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-dashboard-on-surface-variant">
              Klantgegevens (optioneel)
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="apt-client-name" className={labelClass}>
                  Naam klant
                </label>
                <input
                  id="apt-client-name"
                  name="client_name"
                  type="text"
                  maxLength={100}
                  defaultValue={defaults.client_name}
                  disabled={isPending}
                  className={inputClass}
                  placeholder="Voornaam Achternaam"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="apt-client-email" className={labelClass}>
                    E-mail klant
                  </label>
                  <input
                    id="apt-client-email"
                    name="client_email"
                    type="email"
                    maxLength={200}
                    defaultValue={defaults.client_email}
                    disabled={isPending}
                    className={inputClass}
                    placeholder="naam@email.com"
                  />
                </div>
                <div>
                  <label htmlFor="apt-client-phone" className={labelClass}>
                    Telefoon klant
                  </label>
                  <input
                    id="apt-client-phone"
                    name="client_phone"
                    type="tel"
                    maxLength={30}
                    defaultValue={defaults.client_phone}
                    disabled={isPending}
                    className={inputClass}
                    placeholder="+32 …"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="apt-description" className={labelClass}>
              Notities (optioneel)
            </label>
            <textarea
              id="apt-description"
              name="description"
              rows={3}
              maxLength={1000}
              defaultValue={defaults.description}
              disabled={isPending}
              className={`${inputClass} resize-none`}
              placeholder="Interne notities over de afspraak…"
            />
          </div>

          {/* Conflict warning */}
          {conflictTitle && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <div className="flex-1 text-sm text-amber-800">
                  <p className="font-semibold">Overlap met bestaande afspraak</p>
                  <p className="mt-0.5">
                    Er is al een afspraak &ldquo;{conflictTitle}&rdquo; op dit tijdstip. Wil je toch
                    opslaan?
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleForceConfirm}
                  disabled={isPending}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {isPending ? "Bezig…" : "Toch opslaan"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConflictTitle(null)
                    setPendingFormData(null)
                  }}
                  disabled={isPending}
                  className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  Annuleren
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="saas-btn-secondary"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-dashboard-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Bezig…" : isEdit ? "Opslaan" : "Afspraak toevoegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

