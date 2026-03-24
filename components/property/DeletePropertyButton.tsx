"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { deleteProperty } from "@/app/actions/delete-property"

type DeletePropertyButtonProps = {
  propertyId: string
  propertyName: string
  /** After delete, go to dashboard instead of refreshing the current page. */
  redirectToDashboard?: boolean
}

export function DeletePropertyButton({
  propertyId,
  propertyName,
  redirectToDashboard = false,
}: DeletePropertyButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const confirmed = window.confirm(
      `Delete "${propertyName}"? This cannot be undone.`
    )
    if (!confirmed) return

    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      try {
        await deleteProperty(formData)
        if (redirectToDashboard) {
          router.push("/")
          router.refresh()
          return
        }
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete property.")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="inline">
      <input type="hidden" name="propertyId" value={propertyId} />
      <button
        type="submit"
        disabled={isPending}
        aria-label={`Delete ${propertyName}`}
        title="Delete property"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
