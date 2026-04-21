"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { resolveIntakeManualProperty } from "@/app/actions/resolve-intake-manual-property"
import { cn } from "@/lib/utils"

type IntakeManualPropertyFormProps = {
  intakeUploadId: string
  onDone: () => void
}

/**
 * Inline form for resolving an intake row when AI could not confidently match an address.
 * Creates a property and links the PDF using the same pipeline helpers as automatic intake.
 */
export function IntakeManualPropertyForm({ intakeUploadId, onDone }: IntakeManualPropertyFormProps) {
  const router = useRouter()
  const [propertyName, setPropertyName] = useState("")
  const [address, setAddress] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await resolveIntakeManualProperty({
        intakeUploadId,
        propertyName,
        address: address.trim() || null,
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
      className="mt-2 space-y-2 rounded-lg border border-[#519fc8]/40 bg-[#519fc8]/5 p-3 text-left shadow-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div>
        <label htmlFor={`intake-name-${intakeUploadId}`} className="text-xs font-semibold text-[#0e3b6a]">
          Property name <span className="text-destructive">*</span>
        </label>
        <input
          id={`intake-name-${intakeUploadId}`}
          value={propertyName}
          onChange={(e) => setPropertyName(e.target.value)}
          required
          maxLength={200}
          placeholder="e.g. Client — Rue Example 12"
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          disabled={submitting}
        />
      </div>
      <div>
        <label htmlFor={`intake-addr-${intakeUploadId}`} className="text-xs font-semibold text-[#0e3b6a]">
          Address <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id={`intake-addr-${intakeUploadId}`}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={500}
          placeholder="Street, number, postal code, municipality"
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          disabled={submitting}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting || !propertyName.trim()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition",
            submitting || !propertyName.trim()
              ? "cursor-not-allowed bg-[#519fc8]/50"
              : "bg-[#0e3b6a] hover:bg-[#0e3b6a]/90"
          )}
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Create property and link document
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
