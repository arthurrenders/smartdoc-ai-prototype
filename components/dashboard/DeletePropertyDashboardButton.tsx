"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { deleteProperty } from "@/app/actions/delete-property"

type DashboardPropertyOption = {
  id: string
  display_name?: string | null
}

function formatLabel(p: DashboardPropertyOption): string {
  const d = p.display_name?.trim()
  if (d) return d
  return `Property ${p.id.slice(0, 8)}`
}

/**
 * Dashboard-only flow: pick a property, confirm once, then call the same `deleteProperty` server action
 * used on the property detail page. Cascading FK deletes on `properties` remove related rows in Supabase.
 */
export function DeletePropertyDashboardButton({ properties }: { properties: DashboardPropertyOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (properties.length === 0) return null

  function close() {
    setOpen(false)
    setSelectedId("")
    setError(null)
  }

  function onConfirmDelete() {
    if (!selectedId) return
    const selected = properties.find((p) => p.id === selectedId)
    if (!selected) return

    const label = formatLabel(selected)
    const ok = window.confirm(
      `Are you sure you want to delete this property?\n\n"${label}"\n\nThis action cannot be undone.`
    )
    if (!ok) return

    setError(null)
    const fd = new FormData()
    fd.set("propertyId", selectedId)

    startTransition(async () => {
      try {
        await deleteProperty(fd)
        close()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete property.")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/50 bg-white px-4 py-3 text-sm font-bold text-destructive shadow-sm transition-all hover:bg-destructive/10"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        Delete property
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-property-dialog-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-dashboard-outline-variant/30 bg-white p-6 shadow-xl">
            <h3 id="delete-property-dialog-title" className="text-lg font-bold text-dashboard-primary">
              Delete property
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Choose the property to remove. You will be asked to confirm; related documents and analysis data are
              removed with the property (database cascades).
            </p>

            <label htmlFor="delete-property-select" className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Property
            </label>
            <select
              id="delete-property-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
            >
              <option value="">Selecteer een pand…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatLabel(p)}
                </option>
              ))}
            </select>

            {error && (
              <p className="mt-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={!selectedId || pending}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
              >
                {pending ? "Verwijderen…" : "Definitief verwijderen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
