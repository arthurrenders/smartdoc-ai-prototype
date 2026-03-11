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
        "saas-card overflow-hidden border-2 border-primary/15 bg-gradient-to-br from-primary/5 via-card to-secondary/5",
        className
      )}
      role="region"
      aria-label="Suggested next actions"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm" aria-hidden>
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="saas-section-heading">
              Recommended next step
            </h2>
            <p className="saas-section-subheading">
              Based on document status and analysis
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-[hsl(var(--card-border))] bg-card/90 px-5 py-4 shadow-sm">
          <p className="flex items-start gap-3 text-base font-medium text-foreground">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
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
                  className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-card/70 px-4 py-3 text-sm text-foreground"
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
