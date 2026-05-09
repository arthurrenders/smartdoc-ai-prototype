"use client"

import { useEffect, useState, useTransition } from "react"
import { X as XIcon, ArrowRight, ArrowLeft, Download } from "lucide-react"
import {
  getExportReadiness,
  listExportDestinations,
  type DestinationSummary,
} from "@/app/actions/export/get-readiness"
import {
  listPropertiesForExport,
  type ExportPropertyRow,
} from "@/app/actions/export/list-properties-for-export"
import { generateExport } from "@/app/actions/export/generate-export"
import type { ReadinessResult } from "@/lib/export/types"
import { PropertyPicker } from "./PropertyPicker"
import { DestinationCard } from "./DestinationCard"
import { ReadinessPanel } from "./ReadinessPanel"
import { EXPORT_COMPLETE_EVENT } from "./ExportToast"

type Step = "property" | "destination" | "readiness"

type Props = {
  initialPropertyId: string | null
  onClose: () => void
}

export function ExportModal({ initialPropertyId, onClose }: Props) {
  const [step, setStep] = useState<Step>(initialPropertyId ? "destination" : "property")
  const [propertyId, setPropertyId] = useState<string | null>(initialPropertyId)
  const [properties, setProperties] = useState<ExportPropertyRow[] | null>(null)
  const [destinations, setDestinations] = useState<DestinationSummary[] | null>(null)
  const [destinationSlug, setDestinationSlug] = useState<string | null>(null)
  const [readiness, setReadiness] = useState<ReadinessResult | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, startGenerate] = useTransition()

  // Load destinations once when the modal opens
  useEffect(() => {
    let cancelled = false
    listExportDestinations().then((res) => {
      if (cancelled) return
      if (res.ok) setDestinations(res.destinations)
      else setError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Load property list only if we need the picker
  useEffect(() => {
    if (initialPropertyId) return
    let cancelled = false
    listPropertiesForExport().then((res) => {
      if (cancelled) return
      if (res.ok) setProperties(res.properties)
      else setError(res.error)
    })
    return () => {
      cancelled = true
    }
  }, [initialPropertyId])

  // Recompute readiness whenever we land on the readiness step with a (property, destination) pair
  useEffect(() => {
    if (step !== "readiness") return
    if (!propertyId || !destinationSlug) return
    let cancelled = false
    setReadinessLoading(true)
    setReadiness(null)
    setError(null)
    getExportReadiness({ propertyId, destinationSlug }).then((res) => {
      if (cancelled) return
      if (res.ok) setReadiness(res.result)
      else setError(res.error)
      setReadinessLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [step, propertyId, destinationSlug])

  function handleGenerate() {
    if (!propertyId || !destinationSlug) return
    setError(null)
    startGenerate(async () => {
      const res = await generateExport({ propertyId, destinationSlug })
      if (!res.ok) {
        if (res.readiness) setReadiness(res.readiness)
        setError(res.error)
        return
      }
      // Trigger browser download via a hidden anchor
      const a = document.createElement("a")
      a.href = res.downloadUrl
      a.download = res.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.dispatchEvent(new CustomEvent(EXPORT_COMPLETE_EVENT))
      onClose()
    })
  }

  const canExport = readiness?.canExport === true

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label="Smart Export"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + breadcrumb */}
        <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Smart Export</p>
            <Breadcrumb step={step} skipPropertyStep={Boolean(initialPropertyId)} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Sluiten"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {step === "property" && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                Kies welk pand u wilt exporteren.
              </p>
              {properties === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Panden laden…</p>
              ) : (
                <PropertyPicker
                  properties={properties}
                  selectedId={propertyId}
                  onSelect={(id) => setPropertyId(id)}
                />
              )}
            </>
          )}

          {step === "destination" && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                Kies de bestemming. SmartDoc bouwt het juiste formaat per platform.
              </p>
              {destinations === null ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Bestemmingen laden…
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {destinations.map((d) => (
                    <DestinationCard
                      key={d.id}
                      destination={d}
                      selected={destinationSlug === d.slug}
                      onSelect={() => setDestinationSlug(d.slug)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {step === "readiness" && (
            <>
              {readiness ? (
                <ReadinessPanel result={readiness} />
              ) : (
                <ReadinessPanel result={{ score: 0, items: [], canExport: false }} loading />
              )}
              {error && (
                <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </>
          )}

          {error && step !== "readiness" && (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Footer / nav */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-6 py-4">
          <button
            type="button"
            onClick={() => {
              if (step === "destination") {
                if (initialPropertyId) onClose()
                else setStep("property")
              } else if (step === "readiness") {
                setStep("destination")
              } else {
                onClose()
              }
            }}
            className="saas-btn-secondary"
            disabled={isGenerating}
          >
            <ArrowLeft className="h-4 w-4" />
            {step === "property" ? "Annuleren" : "Terug"}
          </button>

          {step === "property" && (
            <button
              type="button"
              onClick={() => setStep("destination")}
              disabled={!propertyId}
              className="saas-btn-primary"
            >
              Volgende
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {step === "destination" && (
            <button
              type="button"
              onClick={() => setStep("readiness")}
              disabled={!destinationSlug}
              className="saas-btn-primary"
            >
              Geschiktheid bekijken
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {step === "readiness" && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canExport || isGenerating || readinessLoading}
              className="saas-btn-primary"
            >
              <Download className="h-4 w-4" />
              {isGenerating ? "Bezig met genereren…" : "Genereren & downloaden"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Breadcrumb({
  step,
  skipPropertyStep,
}: {
  step: Step
  skipPropertyStep: boolean
}) {
  const items: { key: Step; label: string }[] = skipPropertyStep
    ? [
        { key: "destination", label: "Bestemming" },
        { key: "readiness", label: "Geschiktheid" },
      ]
    : [
        { key: "property", label: "Pand" },
        { key: "destination", label: "Bestemming" },
        { key: "readiness", label: "Geschiktheid" },
      ]
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      {items.map((item, idx) => (
        <span key={item.key}>
          <span className={item.key === step ? "font-semibold text-primary" : ""}>{item.label}</span>
          {idx < items.length - 1 && <span className="mx-1.5">›</span>}
        </span>
      ))}
    </p>
  )
}
