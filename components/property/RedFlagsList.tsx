import { CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FlagItem } from "@/app/actions/get-property-detail"

const DOC_TYPE_ORDER = ["EPC", "ASBESTOS", "ELECTRICAL", "SOIL_CERTIFICATE", "URBAN_PLANNING_INFO"] as const
const DOC_TYPE_DUTCH_LABELS: Record<string, string> = {
  EPC: "EPC-attest",
  ASBESTOS: "Asbestattest",
  ELECTRICAL: "Elektrische keuring",
  SOIL_CERTIFICATE: "Bodemattest",
  URBAN_PLANNING_INFO: "Stedenbouwkundige inlichtingen",
}

type RedFlagsListProps = {
  flags: FlagItem[]
  className?: string
}

const severityStyles = {
  red: "border-red-200 bg-red-50/80 dark:border-red-800 dark:bg-red-950/30",
  orange: "border-amber-200 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30",
  green: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30",
}

function groupFlagsByDocumentType(flags: FlagItem[]): Map<string, FlagItem[]> {
  const byType = new Map<string, FlagItem[]>()
  for (const flag of flags) {
    const key = flag.documentTypeName ?? "OTHER"
    if (!byType.has(key)) byType.set(key, [])
    byType.get(key)!.push(flag)
  }
  return byType
}

function dutchDocTypeLabel(name: string): string {
  if (name === "OTHER") return "Overig"
  return DOC_TYPE_DUTCH_LABELS[name] ?? name
}

function dutchFlagTitle(title: string): string {
  const t = title.trim().toLowerCase()
  if (t === "document type not recognized") return "Documenttype niet herkend"
  if (t === "wrong document type") return "Verkeerd documenttype"
  if (t === "manual review required") return "Handmatige controle nodig"
  if (t === "api quota exceeded") return "API-quota overschreden"
  if (t === "api access denied") return "API-toegang geweigerd"
  if (t === "service unavailable") return "Service tijdelijk niet beschikbaar"
  if (t === "empty model response") return "Lege modelrespons"
  if (t === "analysis incomplete") return "Analyse onvolledig"
  if (t === "soil remediation required") return "Bodemsanering vereist"
  if (t === "soil contamination mentioned") return "Bodemverontreiniging vermeld"
  if (t === "urban-planning enforcement or violation") return "Handhaving of overtreding vermeld"
  if (t === "urban-planning restriction or follow-up") return "Stedenbouwkundige beperking of opvolging"
  if (t === "expired epc certificate") return "EPC-attest verlopen"
  if (t.includes("non-compliant electrical")) return "Elektrische installatie niet conform"
  if (t.includes("high-risk asbestos") || t.includes("high risk asbestos")) return "Verhoogd asbestrisico"
  return title
}

function dutchFlagDetails(flag: FlagItem): string {
  const title = flag.title.trim().toLowerCase()
  const details = flag.details.trim()
  const d = details.toLowerCase()

  if (title === "document type not recognized") {
    return "De PDF-tekst bevatte niet de gebruikelijke sleutelwoorden voor dit documenttype. Controleer of het juiste bestand is opgeladen."
  }
  if (title === "wrong document type") {
    return "Het bestand lijkt in een verkeerde rij te zijn opgeladen. Laad de PDF op bij het juiste documenttype."
  }
  if (title === "manual review required") {
    return "De automatische AI-analyse is mislukt. Controleer het document handmatig."
  }
  if (title === "soil remediation required") {
    return "Het bodemattest vermeldt een sanerings- of opruimingsplicht. Volg dit op voor het afsluiten van de transactie."
  }
  if (title === "soil contamination mentioned") {
    return "Het attest vermeldt bodemverontreiniging of een relevante registervermelding. Controleer de details voor het afsluiten."
  }
  if (title === "urban-planning enforcement or violation") {
    return "Het document vermeldt een overtreding, handhavingsitem of onopgelost vergunningsprobleem. Controleer dit voor het afsluiten van de transactie."
  }
  if (title === "urban-planning restriction or follow-up") {
    return "Het document vermeldt beperkingen of opvolgacties die gecontroleerd moeten worden voor publicatie of verkoop."
  }
  if (d.includes("automatic ai analysis failed")) {
    return "De automatische AI-analyse is mislukt. Controleer het document handmatig."
  }
  if (d.includes("pdf text did not match")) {
    return "De PDF-tekst bevatte niet de gebruikelijke sleutelwoorden voor dit documenttype. Controleer of het juiste bestand is opgeladen."
  }
  return details
}

export function RedFlagsList({ flags, className = "" }: RedFlagsListProps) {
  if (flags.length === 0) {
    return (
      <div
        className={cn(
          "saas-card-hover-lift flex items-center gap-4 rounded-xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50 via-white to-white px-5 py-4 shadow-sm dark:border-emerald-900/40 dark:from-emerald-950/30",
          className
        )}
        role="status"
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Geen bevindingen</p>
          <p className="text-xs text-muted-foreground">
            Alle geanalyseerde documenten zijn in orde &mdash; geen actie vereist.
          </p>
        </div>
      </div>
    )
  }

  const byType = groupFlagsByDocumentType(flags)
  const orderedTypes = [
    ...DOC_TYPE_ORDER.filter((t) => byType.has(t)),
    ...Array.from(byType.keys()).filter((k) => !DOC_TYPE_ORDER.includes(k as (typeof DOC_TYPE_ORDER)[number])),
  ]
  const redCount = flags.filter((f) => f.severity === "red").length
  const orangeCount = flags.filter((f) => f.severity === "orange").length

  return (
    <div className={cn(
      "saas-card-hover-lift flex flex-col gap-4 rounded-xl border border-[hsl(var(--card-border))] bg-white p-5 shadow-sm",
      className
    )}>
      <div className="flex items-center gap-2">
        <h2 className="saas-section-heading text-xl sm:text-2xl">Bevindingen</h2>
        <div className="flex items-center gap-1">
          {redCount > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
              {redCount}
            </span>
          )}
          {orangeCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {orangeCount}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-5">
          {orderedTypes.map((docType) => {
            const items = byType.get(docType) ?? []
            return (
              <div key={docType} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  {dutchDocTypeLabel(docType)}
                </h3>
                <ul className="flex flex-col gap-3" role="list">
                  {items.map((flag, index) => (
                    <li
                      key={`${docType}-${index}-${flag.title}`}
                      className={cn(
                        "flex gap-4 rounded-xl border px-4 py-4 transition-shadow duration-200 sm:px-5 sm:py-4",
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
                          <span className="font-medium text-foreground">{dutchFlagTitle(flag.title)}</span>
                          {flag.occurrenceCount != null && flag.occurrenceCount > 1 && (
                            <span className="text-xs text-muted-foreground">
                              Gevonden in {flag.occurrenceCount} documenten
                            </span>
                          )}
                        </div>
                        {flag.details && (
                          <p className="mt-1 text-sm text-muted-foreground">{dutchFlagDetails(flag)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
      </div>
    </div>
  )
}
