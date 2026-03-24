"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { MapPinned } from "lucide-react"
import { geocodePropertyAddress } from "@/app/actions/geocode-property-address"

type Props = {
  propertyId: string
}

export function GeocodePropertyAddressButton({ propertyId }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      try {
        await geocodePropertyAddress(formData)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Geocoding mislukt.")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <button
        type="submit"
        disabled={isPending}
        className="saas-btn-primary inline-flex w-full items-center justify-center gap-2 text-sm disabled:opacity-60 sm:w-auto"
      >
        <MapPinned className="h-4 w-4" aria-hidden />
        {isPending ? "Bezig met geocoderen…" : "Geocode adres (België)"}
      </button>
      <p className="text-xs text-muted-foreground">
        Eenmalig op aanvraag (OpenStreetMap Nominatim). Geen automatische aanroep bij elke pagina.
      </p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
