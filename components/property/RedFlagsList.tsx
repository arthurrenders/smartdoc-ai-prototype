import { cn } from "@/lib/utils"
import type { FlagItem } from "@/app/actions/get-property-detail"

type RedFlagsListProps = {
  flags: FlagItem[]
  className?: string
}

const severityStyles = {
  red: "border-red-200 bg-red-50/80 dark:border-red-800 dark:bg-red-950/30",
  orange: "border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30",
  green: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30",
}

export function RedFlagsList({ flags, className = "" }: RedFlagsListProps) {
  if (flags.length === 0) {
    return (
      <div className={cn("saas-card flex flex-col gap-1", className)}>
        <h2 className="saas-section-heading">Issues &amp; flags</h2>
        <p className="saas-section-subheading">No issues or flags reported for this property.</p>
        <div className="mt-6 rounded-lg border border-[hsl(var(--card-border))] bg-muted/30 px-5 py-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">All clear — no action needed.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("saas-card flex flex-col gap-4", className)}>
      <h2 className="saas-section-heading">Issues &amp; flags</h2>
      <ul className="flex flex-col gap-3" role="list">
        {flags.map((flag, index) => (
          <li
            key={index}
            className={cn(
              "flex gap-4 rounded-lg border px-4 py-3 sm:px-4 sm:py-4",
              severityStyles[flag.severity]
            )}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-card text-xs font-medium text-muted-foreground"
              aria-hidden
            >
              !
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{flag.title}</span>
                {flag.documentTypeName && (
                  <span className="text-xs text-muted-foreground">
                    ({flag.documentTypeName})
                  </span>
                )}
              </div>
              {flag.details && (
                <p className="mt-1 text-sm text-muted-foreground">{flag.details}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
