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
    "border-green-200/80 bg-green-100 text-green-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100",
  orange:
    "border-orange-200/80 bg-orange-100 text-orange-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100",
  red:
    "border-red-200/80 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100",
}

export function StatusBanner({ status, title, description, className }: StatusBannerProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-6 py-5 shadow-sm sm:px-8 sm:py-6",
        variantStyles[status],
        className
      )}
      role="status"
      aria-live="polite"
    >
      <p className="text-lg font-semibold tracking-tight sm:text-xl">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-foreground/85">{description}</p>
    </div>
  )
}
