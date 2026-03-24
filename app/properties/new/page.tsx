"use client"

import { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Plus, Home } from "lucide-react"
import { createProperty } from "@/app/actions/create-property"

export default function NewPropertyPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const formData = new FormData(event.currentTarget)
      const result = await createProperty(formData)
      router.push(`/properties/${result.id}`)
      router.refresh()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create property. Please try again."
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="saas-page">
      <div className="saas-card max-w-xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Add Property
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a new property. It will appear on your dashboard right away.
            </p>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-dark/10 text-brand-dark dark:bg-brand-light/15 dark:text-brand-light">
            <Home className="h-5 w-5" />
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1.5">
            <label htmlFor="displayName" className="text-sm font-medium text-foreground">
              Property name
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={submitting}
              required
              maxLength={80}
              placeholder="e.g. 123 Main Street"
              className="w-full rounded-md border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              Required. Names must be unique (case-insensitive). Up to 80 characters.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="saas-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="saas-btn-primary inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {submitting ? "Creating…" : "Create property"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
