import { ReactNode } from "react"

type StatCardProps = {
  title: string
  value: string | number
  icon?: ReactNode
  className?: string
  trendLabel?: string
  tone?: "primary" | "danger" | "warning" | "info"
}

const toneValueClass: Record<NonNullable<StatCardProps["tone"]>, string> = {
  primary: "text-dashboard-primary",
  danger: "text-red-600",
  warning: "text-amber-600",
  info: "text-sky-600",
}

const toneIconClass: Record<NonNullable<StatCardProps["tone"]>, string> = {
  primary: "bg-blue-50 text-[#0e3b6a]",
  danger: "bg-red-50 text-red-600",
  warning: "bg-amber-50 text-amber-600",
  info: "bg-sky-50 text-sky-600",
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
    <div className={`rounded-xl border border-dashboard-outline-variant/30 bg-white p-6 shadow-sm ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wider text-dashboard-on-surface-variant">
          {title}
        </p>
        {icon ? (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneIconClass[tone]}`}
            aria-hidden
          >
            {icon}
          </div>
        ) : null}
      </div>
      <p className={`text-4xl font-bold tabular-nums tracking-tight ${toneValueClass[tone]}`}>
        {value}
      </p>
      {trendLabel ? (
        <p className="mt-1.5 text-xs font-medium text-dashboard-on-surface-variant">{trendLabel}</p>
      ) : null}
    </div>
  )
}
