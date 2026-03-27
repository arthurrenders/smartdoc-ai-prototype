"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Bell, CheckCheck, X } from "lucide-react"
import type { DashboardNotificationRow } from "@/app/actions/get-dashboard-notifications"
import { markNotificationRead } from "@/app/actions/mark-notification-read"

type Props = {
  notifications: DashboardNotificationRow[]
  error: string | null
}

function formatRelativeDate(iso: string): string {
  const dt = new Date(iso)
  const now = Date.now()
  const diffMs = now - dt.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return dt.toLocaleDateString()
}

export function NotificationsBellDropdown({ notifications, error }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const unread = notifications.filter((n) => !n.read_at)
  const recent = notifications.slice(0, 8)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const el = rootRef.current
      if (!el) return
      if (!el.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onEsc)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open notifications"
        className="relative rounded-full p-2 text-dashboard-on-surface-variant transition-all hover:bg-dashboard-surface-low"
      >
        <Bell className="h-5 w-5" />
        {unread.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[#0e3b6a] px-1.5 text-[10px] font-bold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Recent notifications"
          className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-xl border border-dashboard-outline-variant/30 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-dashboard-outline-variant/20 px-4 py-3">
            <p className="text-sm font-semibold text-[#0e3b6a]">Notifications</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-dashboard-on-surface-variant hover:bg-dashboard-surface-low"
              aria-label="Close notifications"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {error ? (
            <div className="px-4 py-4 text-sm text-destructive">
              Failed to load notifications: {error}
            </div>
          ) : recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-dashboard-on-surface-variant">
              No recent notifications.
            </div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto p-2">
              {recent.map((n) => {
                const propertyLabel = n.propertyDisplayName?.trim() || `Property ${n.property_id.slice(0, 8)}`
                return (
                  <li
                    key={n.id}
                    className={`mb-2 rounded-lg border p-3 ${
                      n.read_at
                        ? "border-dashboard-outline-variant/20 bg-dashboard-surface-low/50"
                        : "border-[#519fc8]/30 bg-[#519fc8]/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{n.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-dashboard-on-surface-variant">{n.body}</p>
                        <p className="mt-1 text-[11px] text-dashboard-on-surface-variant">
                          {propertyLabel} · {formatRelativeDate(n.created_at)}
                        </p>
                      </div>
                      {!n.read_at ? (
                        <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0e3b6a]" aria-hidden />
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Link
                        href={`/properties/${n.property_id}`}
                        onClick={() => setOpen(false)}
                        className="text-xs font-semibold text-[#0e3b6a] hover:underline"
                      >
                        Go to property
                      </Link>
                      {!n.read_at ? (
                        <form action={markNotificationRead} className="inline">
                          <input type="hidden" name="notificationId" value={n.id} />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 rounded-md border border-dashboard-outline-variant/30 bg-white px-2.5 py-1 text-xs font-medium text-dashboard-on-surface transition-colors hover:bg-dashboard-surface-low"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Mark read
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-dashboard-on-surface-variant">Read</span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

