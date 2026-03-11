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
      className={`saas-card flex flex-col gap-3 ${className}`}
    >
      {icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
          {icon}
        </div>
      )}
      <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      <p className="text-sm text-muted-foreground">{title}</p>
    </div>
  )
}
