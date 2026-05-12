"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { resolveIntakeManualProperty } from "@/app/actions/resolve-intake-manual-property"
import { cn } from "@/lib/utils"
import type { IntakePropertyOption } from "@/app/actions/get-intake-property-options"

type IntakeManualPropertyFormProps = {
  intakeUploadId: string
  propertyOptions: IntakePropertyOption[]
  onDone: () => void
  /** Pre-filled from AI / heuristic extraction so the user can confirm or add postcode */
  suggestedAddress?: string | null
}

/**
 * Inline form for resolving an intake row when AI could not confidently match an address.
 * Creates a property and links the PDF using the same pipeline helpers as automatic intake.
 */
export function IntakeManualPropertyForm({
  intakeUploadId,
  propertyOptions,
  onDone,
  suggestedAddress,
}: IntakeManualPropertyFormProps) {
  const router = useRouter()
  const [address, setAddress] = useState(() => suggestedAddress?.trim() ?? "")
  const [selectedPropertyId, setSelectedPropertyId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await resolveIntakeManualProperty({
        intakeUploadId,
        propertyName: null,
        address: address.trim() || null,
        selectedPropertyId: selectedPropertyId || null,
      })
      if (!res.ok) {
        setError(res.error ?? "Could not create property.")
        return
      }
      onDone()
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="mt-2 space-y-2 rounded-lg border border-brand-light/40 bg-brand-light/5 p-3 text-left shadow-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div>
        <label htmlFor={`intake-prop-${intakeUploadId}`} className="text-xs font-semibold text-brand-dark">
          Existing property <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <select
          id={`intake-prop-${intakeUploadId}`}
          value={selectedPropertyId}
          onChange={(e) => {
            const nextId = e.target.value
            setSelectedPropertyId(nextId)
            const selected = propertyOptions.find((property) => property.id === nextId)
            if (selected?.addressLine) {
              setAddress(selected.addressLine)
            }
          }}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          disabled={submitting}
        >
          <option value="">Select an existing property…</option>
          {propertyOptions.map((property) => (
            <option key={property.id} value={property.id}>
              {property.displayName}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`intake-addr-${intakeUploadId}`} className="text-xs font-semibold text-brand-dark">
          Address{" "}
          <span className="font-normal text-muted-foreground">
            {selectedPropertyId ? "(uses selected property's address)" : "(required if no property selected)"}
          </span>
        </label>
        <input
          id={`intake-addr-${intakeUploadId}`}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={500}
          placeholder="Street + number (city and postal code optional)"
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground"
          disabled={submitting || Boolean(selectedPropertyId)}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting || (!selectedPropertyId && !address.trim())}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition",
            submitting || (!selectedPropertyId && !address.trim())
              ? "cursor-not-allowed bg-brand-light/50"
              : "bg-brand-dark hover:bg-brand-dark/90"
          )}
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Match or create property and link document
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={submitting}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

