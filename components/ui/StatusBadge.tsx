import { cn } from "@/lib/utils"

type StatusVariant = "green" | "orange" | "red"

type StatusBadgeProps = {
  status: StatusVariant
  label?: string
  className?: string
}

const variantStyles: Record<StatusVariant, string> = {
  green: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  orange: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  red: "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300",
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
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium",
        variantStyles[status],
        className
      )}
    >
      {resolvedLabel}
    </span>
  )
}
