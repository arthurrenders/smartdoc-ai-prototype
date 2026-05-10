"use client"

import { useState } from "react"
import { FileText, CheckCircle2, AlertCircle, FileQuestion, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PropertySummaryCounts } from "@/app/actions/get-property-detail"

type SummaryTone = "green" | "orange" | "red" | "pending"

type PropertyAISummaryCardProps = {
  summaryCounts: Partial<PropertySummaryCounts> | null
  status?: SummaryTone
  fallbackParagraph?: string
  className?: string
}

function deriveTone(counts: Partial<PropertySummaryCounts> | null, status?: SummaryTone): SummaryTone {
  if (status) return status
  if (!counts) return "pending"
  if (counts.urgentActionNeeded) return "red"
  const { validCount = 0, missingCount = 0, manualReviewCount = 0, requiredTotal = 0 } = counts
  if (requiredTotal > 0 && validCount === requiredTotal && missingCount === 0 && manualReviewCount === 0) return "green"
  if (validCount === 0 && missingCount === 0 && manualReviewCount === 0) return "pending"
  return "orange"
}

const toneStyles: Record<SummaryTone, string> = {
  green:
    "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30",
  orange:
    "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30",
  red: "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30",
  pending:
    "border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-900/40",
}

export function PropertyAISummaryCard({
  summaryCounts,
  status,
  fallbackParagraph = "Geen documentanalysedata beschikbaar. Upload documenten en voer een analyse uit voor een samenvatting.",
  className = "",
}: PropertyAISummaryCardProps) {
  const [paragraphOpen, setParagraphOpen] = useState(false)

  const counts = summaryCounts ?? {}
  const validCount = counts.validCount ?? 0
  const missingCount = counts.missingCount ?? 0
  const manualReviewCount = counts.manualReviewCount ?? 0
  const requiredTotal = counts.requiredTotal ?? 0
  const urgentActionNeeded = counts.urgentActionNeeded ?? false
  const paragraph = counts.summaryParagraph ?? fallbackParagraph
  const tone = deriveTone(summaryCounts, status)
  const hasCounts = requiredTotal > 0 || validCount > 0 || missingCount > 0 || manualReviewCount > 0

  return (
    <div
      className={cn(
        "saas-card-elevated flex flex-col gap-5 border",
        toneStyles[tone],
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-dark/10 text-brand-dark dark:bg-brand-light/15 dark:text-brand-light" aria-hidden>
          <FileText className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="saas-section-heading text-xl sm:text-2xl">Documentsamenvatting</h2>
          <p className="saas-section-subheading">
            Status vereiste documenten voor dit pand
          </p>
        </div>
      </div>

      {hasCounts && (
        <div className="grid grid-cols-2 gap-3" aria-label="Document counts">
          <div className="flex items-center gap-2.5 rounded-lg border border-[hsl(var(--card-border))] bg-card/80 px-3 py-2.5 shadow-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums text-foreground">{validCount}</p>
              <p className="text-[11px] text-muted-foreground">Geldig</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-[hsl(var(--card-border))] bg-card/80 px-3 py-2.5 shadow-sm">
            <FileQuestion className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums text-foreground">{missingCount}</p>
              <p className="text-[11px] text-muted-foreground">Ontbreekt</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg border border-[hsl(var(--card-border))] bg-card/80 px-3 py-2.5 shadow-sm">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums text-foreground">{manualReviewCount}</p>
              <p className="text-[11px] text-muted-foreground">Handm. review</p>
            </div>
          </div>
          <div className="flex flex-col justify-center rounded-lg border border-[hsl(var(--card-border))] bg-card/80 px-3 py-2.5 shadow-sm">
            {urgentActionNeeded ? (
              <>
                <p className="text-xs font-semibold leading-tight text-red-700 dark:text-red-300">Urgente actie</p>
                <p className="text-[11px] text-muted-foreground">Los op voor afsluiting</p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium leading-tight text-foreground">Geen urgentie</p>
                <p className="text-[11px] text-muted-foreground">Zie actiepunten</p>
              </>
            )}
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setParagraphOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={paragraphOpen}
        >
          {paragraphOpen ? (
            <><ChevronUp className="h-3.5 w-3.5" /> Verbergen</>
          ) : (
            <><ChevronDown className="h-3.5 w-3.5" /> Toon samenvatting</>
          )}
        </button>

        {paragraphOpen && (
          <div className="mt-2 rounded-lg border border-[hsl(var(--card-border))] bg-card/50 p-4">
            <p className="text-sm font-medium text-muted-foreground">Samenvatting</p>
            <p className="mt-2 leading-relaxed text-foreground">{paragraph}</p>
          </div>
        )}
      </div>
    </div>
  )
}
