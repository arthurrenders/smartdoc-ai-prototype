"use client"

import { useRouter } from "next/navigation"
import type { FormEvent } from "react"
import { useState, useTransition } from "react"
import { Sparkles } from "lucide-react"
import { enrichPropertyLocation } from "@/app/actions/enrich-property-location"

type Props = {
  propertyId: string
  disabled?: boolean
}

export function EnrichPropertyLocationButton({ propertyId, disabled }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      try {
        await enrichPropertyLocation(formData)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Locatieverrijking mislukt.")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <button
        type="submit"
        disabled={isPending || disabled}
        className="saas-btn-secondary inline-flex w-full items-center justify-center gap-2 text-sm transition-all duration-200 disabled:opacity-60 sm:w-auto"
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        {isPending ? "Bezig met verrijken…" : "Locatie verrijken (België)"}
      </button>
      <p className="text-xs text-muted-foreground">
        Eenmalig op aanvraag: resultaat wordt opgeslagen (OpenStreetMap). Geen live call bij elke
        paginaweergave.
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
