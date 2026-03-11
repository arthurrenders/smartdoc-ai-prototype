import { cn } from "@/lib/utils"

type StatusVariant = "green" | "orange" | "red"

type StatusBannerProps = {
  status: StatusVariant
  title: string
  description: string
  className?: string
}

const variantStyles: Record<StatusVariant, string> = {
  green:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
  orange:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
  red:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100",
}

export function StatusBanner({ status, title, description, className }: StatusBannerProps) {
  return (
    <div
      className={cn(
        "rounded-xl border px-5 py-4 sm:px-6 sm:py-5",
        variantStyles[status],
        className
      )}
      role="status"
      aria-live="polite"
    >
      <p className="text-base font-semibold sm:text-lg">{title}</p>
      <p className="mt-1.5 text-sm opacity-90">{description}</p>
    </div>
  )
}
