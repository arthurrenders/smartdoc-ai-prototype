import { cn } from "@/lib/utils"

type StatusVariant = "green" | "orange" | "red"

type StatusBadgeProps = {
  status: StatusVariant
  label?: string
  className?: string
}

const variantStyles: Record<StatusVariant, string> = {
  green:
    "border-green-200/80 bg-green-100 text-green-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  orange:
    "border-orange-200/80 bg-orange-100 text-orange-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  red: "border-red-200/80 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300",
}

const defaultLabels: Record<StatusVariant, string> = {
  green: "OK",
  orange: "Attention",
  red: "Critical",
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const resolvedLabel = label ?? defaultLabels[status]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-tight",
        variantStyles[status],
        className
      )}
    >
      {resolvedLabel}
    </span>
  )
}
