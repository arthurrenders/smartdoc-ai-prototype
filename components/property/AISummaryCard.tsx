import { FileText } from "lucide-react"

type AISummaryCardProps = {
  summary: string
  className?: string
}

export function AISummaryCard({ summary, className = "" }: AISummaryCardProps) {
  return (
    <div
      className={`saas-card-elevated flex flex-col gap-4 ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-dark/10 text-brand-dark">
          <FileText className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="saas-section-heading">AI Executive Summary</h2>
          <p className="saas-section-subheading">
            Combined overview of all analyzed documents
          </p>
        </div>
      </div>
      <p className="leading-relaxed text-foreground/90">{summary}</p>
    </div>
  )
}
