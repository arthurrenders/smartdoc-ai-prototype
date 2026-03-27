import Link from "next/link"
import { Bell } from "lucide-react"
import type { DashboardNotificationRow } from "@/app/actions/get-dashboard-notifications"
import { markNotificationRead } from "@/app/actions/mark-notification-read"

type Props = {
  notifications: DashboardNotificationRow[]
  error: string | null
  syncNote?: string | null
}

export function InAppNotificationsCard({ notifications, error, syncNote }: Props) {
  const unread = notifications.filter((n) => !n.read_at)
  const read = notifications.filter((n) => n.read_at)

  return (
    <div className="space-y-4">
      <h2 className="dashboard-section-title">
        <Bell className="h-5 w-5 text-dashboard-error" aria-hidden />
        Notifications
        {unread.length > 0 ? (
          <span className="rounded-full bg-dashboard-error-container px-2 py-0.5 text-xs font-semibold text-dashboard-error">
            {unread.length} ongelezen
          </span>
        ) : null}
      </h2>
      {syncNote && (
        <div
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {syncNote}
        </div>
      )}
      {error && (
        <div
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          Meldingen konden niet geladen worden: {error}
        </div>
      )}

      {!error && notifications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-dashboard-outline-variant/40 bg-dashboard-surface px-6 py-12 text-center text-sm text-dashboard-on-surface-variant">
          Geen meldingen. Zodra een datum binnen een herinneringsvenster valt, verschijnt die hier.
        </div>
      ) : (
        <div className="space-y-3">
          {unread.length > 0 && (
            <div className="space-y-3">
              <ul className="space-y-3">
                {unread.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl border-l-4 border-dashboard-error bg-dashboard-error-container p-4 text-sm"
                  >
                    <p className="font-semibold text-dashboard-on-surface">{n.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-dashboard-on-surface-variant">{n.body}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Link
                        href={`/properties/${n.property_id}`}
                        className="text-xs font-semibold text-dashboard-primary underline-offset-2 transition-colors hover:underline"
                      >
                        Naar pand
                      </Link>
                      <form action={markNotificationRead} className="inline">
                        <input type="hidden" name="notificationId" value={n.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-dashboard-outline-variant/30 bg-white px-3 py-1.5 text-xs font-medium text-dashboard-on-surface transition-all duration-200 hover:bg-dashboard-surface-low"
                        >
                          Markeer gelezen
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {read.length > 0 && (
            <div className="pt-1">
              <ul className="space-y-2">
                {read.slice(0, 8).map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl border border-dashboard-outline-variant/20 bg-dashboard-surface-high/60 px-4 py-3 text-sm"
                  >
                    <p className="font-medium text-dashboard-on-surface">{n.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-dashboard-on-surface-variant">{n.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
