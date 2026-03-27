import { ReactNode } from "react"

type StatCardProps = {
  title: string
  value: string | number
  icon?: ReactNode
  className?: string
  trendLabel?: string
  tone?: "primary" | "danger" | "warning" | "info"
}

const toneClass: Record<NonNullable<StatCardProps["tone"]>, string> = {
  primary: "text-dashboard-primary",
  danger: "text-dashboard-error",
  warning: "text-dashboard-tertiary-fixed-dim",
  info: "text-dashboard-primary-container",
}

export function StatCard({
  title,
  value,
  icon,
  className = "",
  trendLabel,
  tone = "primary",
}: StatCardProps) {
  return (
    <div className={`rounded-xl border border-dashboard-outline-variant/30 bg-dashboard-surface p-6 shadow-sm ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-dashboard-on-surface-variant">{title}</p>
        {icon ? (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dashboard-surface-low text-dashboard-primary"
            aria-hidden
          >
            {icon}
          </div>
        ) : null}
      </div>
      <div className="flex items-baseline gap-2">
        <p className={`text-3xl font-bold tracking-tight tabular-nums ${toneClass[tone]}`}>{value}</p>
        {trendLabel ? <p className="text-xs font-semibold text-dashboard-on-surface-variant">{trendLabel}</p> : null}
      </div>
      <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-dashboard-surface-variant">
        <div
          className={`h-full rounded-full ${tone === "danger" ? "bg-dashboard-error" : tone === "warning" ? "bg-dashboard-tertiary-fixed-dim" : tone === "info" ? "bg-dashboard-primary-container" : "bg-dashboard-primary"}`}
          style={{ width: tone === "danger" ? "18%" : tone === "warning" ? "44%" : tone === "info" ? "32%" : "72%" }}
        />
      </div>
    </div>
  )
}
