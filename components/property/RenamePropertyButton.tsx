"use client"

import { useEffect, useState, useTransition, type FormEvent } from "react"
import { Pencil } from "lucide-react"
import { useRouter } from "next/navigation"
import { renameProperty } from "@/app/actions/rename-property"

type RenamePropertyButtonProps = {
  propertyId: string
  currentDisplayName: string
}

export function RenamePropertyButton({
  propertyId,
  currentDisplayName,
}: RenamePropertyButtonProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [draftName, setDraftName] = useState(currentDisplayName)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!isOpen) return
    setDraftName(currentDisplayName)
    setError(null)
  }, [currentDisplayName, isOpen])

  function open() {
    setIsOpen(true)
    setError(null)
    setDraftName(currentDisplayName)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      try {
        await renameProperty(formData)
        setIsOpen(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rename property.")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        <Pencil className="h-4 w-4" aria-hidden />
        Rename
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Rename property"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">Rename property</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  This name is shown on your dashboard and property page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Close"
              >
                X
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 px-4 py-4">
              <input type="hidden" name="propertyId" value={propertyId} />

              <div className="space-y-1.5">
                <label htmlFor="displayName" className="text-sm font-medium text-foreground">
                  Property name
                </label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={isPending}
                  autoFocus
                  required
                  maxLength={80}
                  className="w-full rounded-md border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">
                  Up to 80 characters.
                </p>
              </div>

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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="saas-btn-primary"
                >
                  {isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

