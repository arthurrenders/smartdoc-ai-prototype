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
    <div className="saas-card">
      <h2 className="saas-section-heading inline-flex flex-wrap items-center gap-2 text-xl sm:text-2xl">
        <Bell className="h-5 w-5 text-brand-dark dark:text-brand-light" aria-hidden />
        Meldingen
        {unread.length > 0 ? (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
            {unread.length} ongelezen
          </span>
        ) : null}
      </h2>
      <p className="saas-section-subheading mb-2 text-muted-foreground/90">
        Herinneringen op basis van documentdatums. Standaard:{" "}
        <strong className="font-medium text-foreground/90">7, 14 en 30 dagen vóór</strong> de datum (instelbaar in{" "}
        <code className="rounded bg-muted px-1 text-xs">notification_rules</code>).
      </p>
      <p className="mb-8 text-xs text-muted-foreground/80">
        Bij elk bezoek aan het dashboard worden ontbrekende meldingen aangemaakt — geen aparte scheduler.
      </p>
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
        <div className="rounded-xl border border-dashed border-[hsl(var(--border))] bg-white/80 px-6 py-12 text-center text-sm text-muted-foreground dark:bg-card/50">
          Geen meldingen. Zodra een datum binnen een herinneringsvenster valt, verschijnt die hier.
        </div>
      ) : (
        <div className="space-y-8">
          {unread.length > 0 && (
            <div className="rounded-xl bg-white/90 p-4 shadow-sm dark:bg-card/80">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ongelezen
              </p>
              <ul className="space-y-3">
                {unread.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl border border-[hsl(var(--border))] bg-white p-4 text-sm transition-all duration-200 hover:border-brand-light/50 hover:shadow-sm dark:bg-background/50"
                  >
                    <p className="font-semibold text-foreground">{n.title}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{n.body}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Link
                        href={`/properties/${n.property_id}`}
                        className="text-xs font-semibold text-brand-dark underline-offset-2 transition-colors hover:text-brand-dark/80 hover:underline dark:text-brand-light"
                      >
                        Naar pand
                      </Link>
                      <form action={markNotificationRead} className="inline">
                        <input type="hidden" name="notificationId" value={n.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-foreground transition-all duration-200 hover:bg-gray-50 dark:border-border dark:bg-card dark:hover:bg-muted/50"
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
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent gelezen
              </p>
              <ul className="space-y-2 opacity-90">
                {read.slice(0, 8).map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl border border-transparent bg-white/60 px-4 py-3 text-sm dark:bg-muted/20"
                  >
                    <p className="font-medium text-foreground">{n.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{n.body}</p>
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
