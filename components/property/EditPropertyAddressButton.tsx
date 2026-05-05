"use client"

import { useEffect, useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Pencil } from "lucide-react"
import { updatePropertyAddress } from "@/app/actions/update-property-address"

type Props = {
  propertyId: string
  initialRawLine1: string
}

export function EditPropertyAddressButton({ propertyId, initialRawLine1 }: Props) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [draft, setDraft] = useState(initialRawLine1)
  const [syncTitle, setSyncTitle] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!isOpen) return
    setDraft(initialRawLine1)
    setSyncTitle(true)
    setError(null)
  }, [initialRawLine1, isOpen])

  function open() {
    setIsOpen(true)
    setError(null)
    setDraft(initialRawLine1)
    setSyncTitle(true)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)
    console.info("[SmartDoc][address-edit-ui] submit", {
      propertyId,
      currentInputValue: draft,
      submittedValue: String(formData.get("rawLine1") ?? ""),
    })

    startTransition(async () => {
      try {
        await updatePropertyAddress(formData)
        console.info("[SmartDoc][address-edit-ui] save completed", { propertyId })
        setIsOpen(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Opslaan mislukt.")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={isPending}
        className="saas-btn-secondary inline-flex items-center gap-2 py-2.5 text-sm disabled:opacity-50"
      >
        <Pencil className="h-4 w-4" aria-hidden />
        Adres bewerken
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Adres bewerken"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">Adres bewerken</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ruwe adresregel voor geocoding. Na opslaan opnieuw geocoderen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Sluiten"
              >
                X
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 px-4 py-4">
              <input type="hidden" name="propertyId" value={propertyId} />

              <div className="space-y-1.5">
                <label htmlFor="rawLine1" className="text-sm font-medium text-foreground">
                  Adres (ruwe regel)
                </label>
                <textarea
                  id="rawLine1"
                  name="rawLine1"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={isPending}
                  required
                  rows={3}
                  maxLength={500}
                  autoFocus
                  className="w-full resize-y rounded-md border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">Max. 500 tekens.</p>
              </div>

              <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="syncDisplayName"
                  value="on"
                  checked={syncTitle}
                  onChange={(e) => setSyncTitle(e.target.checked)}
                  disabled={isPending}
                  className="mt-1 h-4 w-4 rounded border-[hsl(var(--border))]"
                />
                <span>
                  Ook <strong>pandtitel</strong> bijwerken (zelfde tekst als hierboven; max. 80 tekens
                  wanneer aangevinkt)
                </span>
              </label>

              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                  className="saas-btn-secondary"
                >
                  Annuleren
                </button>
                <button type="submit" disabled={isPending} className="saas-btn-primary">
                  {isPending ? "Opslaan…" : "Opslaan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
