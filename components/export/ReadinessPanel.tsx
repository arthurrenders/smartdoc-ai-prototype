"use client"

import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react"
import type { ReadinessResult } from "@/lib/export/types"

type Props = {
  result: ReadinessResult
  loading?: boolean
}

export function ReadinessPanel({ result, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        Geschiktheid berekenen…
      </div>
    )
  }

  const blockerCount = result.items.filter((i) => i.severity === "blocker").length
  const warningCount = result.items.filter((i) => i.severity === "warning").length
  const okCount = result.items.filter((i) => i.severity === "ok").length
  const hasManualMissing = result.items.some((i) => i.manual && i.severity !== "ok")

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-dashboard-primary p-5 text-white shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="font-headline text-3xl font-extrabold">{result.score}%</span>
            <p className="mt-0.5 text-xs font-bold uppercase tracking-widest opacity-80">
              Geschiktheidsscore
            </p>
          </div>
          <div className="flex items-center gap-4 text-center">
            <Stat value={okCount} label="Aanwezig" />
            <div className="h-8 w-px bg-white/25" />
            <Stat value={warningCount} label="Waarsch." />
            <div className="h-8 w-px bg-white/25" />
            <Stat value={blockerCount} label="Blokker" />
          </div>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full bg-white transition-all"
            style={{ width: `${result.score}%` }}
          />
        </div>
      </div>

      {hasManualMissing && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Sommige documenten ontbreken nog in SmartDoc of moeten rechtstreeks op het portaal of
            bij de notaris worden toegevoegd. Deze blokkeren de export niet; SmartDoc voegt automatisch
            een notitie (<code className="rounded bg-amber-100 px-1 py-0.5 text-[11px]">ACTION_REQUIRED.txt</code>) toe aan het ZIP-bestand.
          </p>
        </div>
      )}

      <ul className="divide-y divide-[hsl(var(--card-border))] rounded-xl border border-[hsl(var(--card-border))] bg-white">
        {result.items.map((item) => (
          <li key={item.key} className="flex items-start gap-3 px-4 py-3 text-sm">
            <ItemIcon severity={item.severity} manual={item.manual} />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{item.label}</p>
              {item.reason && (
                <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
              )}
            </div>
            <SeverityBadge severity={item.severity} manual={item.manual} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-[10px] opacity-70">{label}</p>
    </div>
  )
}

function ItemIcon({
  severity,
  manual,
}: {
  severity: "ok" | "warning" | "blocker"
  manual?: boolean
}) {
  if (severity === "ok") return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
  if (severity === "warning")
    return manual ? (
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
    ) : (
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
    )
  return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
}

function SeverityBadge({
  severity,
  manual,
}: {
  severity: "ok" | "warning" | "blocker"
  manual?: boolean
}) {
  if (severity === "ok") return <span className="saas-badge saas-badge-success">Aanwezig</span>
  if (severity === "warning") {
    if (manual) {
      return (
        <span className="inline-flex items-center rounded-full border border-dashed border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
          Handmatig
        </span>
      )
    }
    return <span className="saas-badge saas-badge-warning">Waarschuwing</span>
  }
  return <span className="saas-badge saas-badge-danger">Ontbrekend</span>
}
