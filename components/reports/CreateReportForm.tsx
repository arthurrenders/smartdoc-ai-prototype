"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { createPropertyReport, type PropertyOption } from "@/app/actions/reports"

type Props = {
  properties: PropertyOption[]
}

export function CreateReportForm({ properties }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      try {
        await createPropertyReport(formData)
        event.currentTarget.reset()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create report.")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-dashboard-outline-variant/20 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-dashboard-primary">New report</h2>
      <div className="space-y-1">
        <label htmlFor="report-property" className="text-xs font-semibold uppercase tracking-wide text-dashboard-on-surface-variant">
          Linked property
        </label>
        <select
          id="report-property"
          name="propertyId"
          required
          disabled={isPending}
          className="w-full rounded-lg border border-dashboard-outline-variant/30 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-primary/30"
        >
          <option value="">Select a property</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.display_name?.trim() || `Property ${property.id.slice(0, 8)}`}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="report-title" className="text-xs font-semibold uppercase tracking-wide text-dashboard-on-surface-variant">
          Title
        </label>
        <input
          id="report-title"
          name="title"
          required
          maxLength={120}
          disabled={isPending}
          className="w-full rounded-lg border border-dashboard-outline-variant/30 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-primary/30"
          placeholder="e.g. Follow-up call summary"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="report-author" className="text-xs font-semibold uppercase tracking-wide text-dashboard-on-surface-variant">
          Author (optional)
        </label>
        <input
          id="report-author"
          name="authorName"
          maxLength={80}
          disabled={isPending}
          className="w-full rounded-lg border border-dashboard-outline-variant/30 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-primary/30"
          placeholder="Employee name"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="report-note" className="text-xs font-semibold uppercase tracking-wide text-dashboard-on-surface-variant">
          Note
        </label>
        <textarea
          id="report-note"
          name="noteText"
          required
          maxLength={4000}
          disabled={isPending}
          rows={5}
          className="w-full resize-y rounded-lg border border-dashboard-outline-variant/30 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dashboard-primary/30"
          placeholder="Plain text internal note..."
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center rounded-lg bg-dashboard-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isPending ? "Saving..." : "Create report"}
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  )
}

