"use client"

import { useState, FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Plus, Home } from "lucide-react"
import { createProperty } from "@/app/actions/create-property"

export default function NewPropertyPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      // Properties are created with just the user_id; you can rename the
      // human-friendly display name later from the property page.
      const formData = new FormData()
      const result = await createProperty(formData)
      router.push(`/properties/${result.id}`)
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Add Property
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a new property listing. It will immediately appear in your dashboard.
            </p>
          </div>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Home className="h-5 w-5" />
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-md bg-muted/60 p-4 text-sm text-muted-foreground">
            Currently, properties do not have any additional editable fields beyond their
            automatically generated ID. A new property will be created for your account and
            will behave exactly like your existing properties.
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

