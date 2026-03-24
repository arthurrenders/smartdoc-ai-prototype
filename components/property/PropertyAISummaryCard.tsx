import { FileText, CheckCircle2, AlertCircle, FileQuestion } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PropertySummaryCounts } from "@/app/actions/get-property-detail"

type SummaryTone = "green" | "orange" | "red"

type PropertyAISummaryCardProps = {
  /** Structured counts and narrative. Can be partial; missing values are treated as 0. */
  summaryCounts: Partial<PropertySummaryCounts> | null
  /** Overall property status for tone (border/background). Defaults from urgentActionNeeded and counts if not set. */
  status?: SummaryTone
  /** Optional fallback when summaryCounts is null or empty. */
  fallbackParagraph?: string
  className?: string
}

function deriveTone(counts: Partial<PropertySummaryCounts> | null, status?: SummaryTone): SummaryTone {
  if (status) return status
  if (!counts) return "orange"
  if (counts.urgentActionNeeded) return "red"
  const { validCount = 0, missingCount = 0, manualReviewCount = 0, requiredTotal = 0 } = counts
  if (requiredTotal > 0 && validCount === requiredTotal && missingCount === 0 && manualReviewCount === 0) return "green"
  return "orange"
}

const toneStyles: Record<SummaryTone, string> = {
  green:
    "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30",
  orange:
    "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30",
  red: "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30",
}

export function PropertyAISummaryCard({
  summaryCounts,
  status,
  fallbackParagraph = "No document analysis data available. Upload documents and run analysis to see a summary.",
  className = "",
}: PropertyAISummaryCardProps) {
  const counts = summaryCounts ?? {}
  const validCount = counts.validCount ?? 0
  const missingCount = counts.missingCount ?? 0
  const manualReviewCount = counts.manualReviewCount ?? 0
  const requiredTotal = counts.requiredTotal ?? 0
  const urgentActionNeeded = counts.urgentActionNeeded ?? false
  const paragraph = counts.summaryParagraph ?? fallbackParagraph
  const tone = deriveTone(summaryCounts, status)

  return (
    <div
      className={cn(
        "saas-card-elevated flex flex-col gap-8 border",
        toneStyles[tone],
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-dark/10 text-brand-dark dark:bg-brand-light/15 dark:text-brand-light" aria-hidden>
          <FileText className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="saas-section-heading text-xl sm:text-2xl">Document summary</h2>
          <p className="saas-section-subheading">
            Status of required documents for this property
          </p>
        </div>
      </div>

      {(requiredTotal > 0 || validCount > 0 || missingCount > 0 || manualReviewCount > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4" aria-label="Document counts">
          <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--card-border))] bg-card/80 px-4 py-3 shadow-sm">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{validCount}</p>
              <p className="text-xs text-muted-foreground">Valid</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--card-border))] bg-card/80 px-4 py-3 shadow-sm">
            <FileQuestion className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{missingCount}</p>
              <p className="text-xs text-muted-foreground">Missing</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--card-border))] bg-card/80 px-4 py-3 shadow-sm">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-xl font-semibold tabular-nums text-foreground sm:text-2xl">{manualReviewCount}</p>
              <p className="text-xs text-muted-foreground">Manual review</p>
            </div>
          </div>
          <div className="flex flex-col justify-center rounded-lg border border-[hsl(var(--card-border))] bg-card/80 px-4 py-3 shadow-sm">
            {urgentActionNeeded ? (
              <>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">Urgent action needed</p>
                <p className="text-xs text-muted-foreground">Address issues before closing</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">No urgent action</p>
                <p className="text-xs text-muted-foreground">Review suggested steps</p>
              </>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-[hsl(var(--card-border))] bg-card/50 p-4">
        <p className="text-sm font-medium text-muted-foreground">Summary</p>
        <p className="mt-2 leading-relaxed text-foreground">{paragraph}</p>
      </div>
    </div>
  )
}
