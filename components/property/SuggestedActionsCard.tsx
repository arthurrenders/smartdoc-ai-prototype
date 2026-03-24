import { Sparkles, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SuggestedActionsData } from "@/app/actions/get-property-detail"

type SuggestedActionsCardProps = {
  /** Structured primary + follow-up actions from property/document analysis */
  actions: SuggestedActionsData
  className?: string
}

const MAX_FOLLOW_UPS = 3

export function SuggestedActionsCard({ actions, className = "" }: SuggestedActionsCardProps) {
  const { primary, followUps } = actions
  const displayFollowUps = followUps.slice(0, MAX_FOLLOW_UPS)

  return (
    <div
      className={cn(
        "saas-card overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-brand-light/15 via-white to-slate-50/80 shadow-md transition-shadow duration-200 hover:shadow-lg dark:from-brand-dark/20 dark:via-card dark:to-card",
        className
      )}
      role="region"
      aria-label="Suggested next actions"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm" aria-hidden>
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="saas-section-heading text-xl sm:text-2xl">
              Recommended next step
            </h2>
            <p className="saas-section-subheading">
              Based on document status and analysis
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[hsl(var(--card-border))] bg-white/90 px-5 py-5 shadow-sm dark:bg-card/90">
          <p className="flex items-start gap-3 text-base font-medium text-foreground">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
              aria-hidden
            >
              1
            </span>
            <span className="pt-0.5">{primary}</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </p>
        </div>

        {displayFollowUps.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Follow-up actions
            </p>
            <ul className="flex flex-col gap-2" role="list">
              {displayFollowUps.map((action, index) => (
                <li
                  key={index}
                  className="flex items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-card/80 px-4 py-3.5 text-sm text-foreground transition-all duration-200 hover:border-brand-light/50 hover:shadow-sm dark:hover:border-brand-light/25"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                    aria-hidden
                  >
                    {index + 2}
                  </span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
