import { ReactNode } from "react"

type StatCardProps = {
  title: string
  value: string | number
  icon?: ReactNode
  className?: string
}

export function StatCard({ title, value, icon, className = "" }: StatCardProps) {
  return (
    <div
      className={`saas-card flex flex-col gap-4 ${className}`}
    >
      {icon && (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-dark/10 text-brand-dark dark:bg-brand-light/15 dark:text-brand-light" aria-hidden>
          {icon}
        </div>
      )}
      <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
    </div>
  )
}
