import { CheckCircle2 } from "lucide-react"

type SuggestedActionsBoxProps = {
  actions: string[]
  className?: string
}

export function SuggestedActionsBox({ actions, className = "" }: SuggestedActionsBoxProps) {
  return (
    <div
      className={`saas-card flex flex-col gap-4 border-brand-light/30 bg-brand-dark/5 ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-dark text-white">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="saas-section-heading">Suggested next steps</h2>
          <p className="saas-section-subheading">
            AI-recommended actions based on document status
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-3" role="list">
        {actions.map((action, index) => (
          <li
            key={index}
            className="flex gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-light/20 text-brand-dark text-xs font-semibold">
              {index + 1}
            </span>
            <span className="text-foreground">{action}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
