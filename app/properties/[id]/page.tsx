import type { Metadata } from "next"
import { notFound } from "next/navigation"
import nextDynamic from "next/dynamic"
import Link from "next/link"
import {
  Layers3,
  Clock,
  CircleDashed,
  MapPin,
  FileText,
  Sparkles,
} from "lucide-react"
import { getPropertyDetail } from "@/app/actions/get-property-detail"
import { getDashboardNotifications } from "@/app/actions/get-dashboard-notifications"
import { getPropertyTimeline } from "@/app/actions/get-property-timeline"
import { PropertyAddressCard } from "@/components/property/PropertyAddressCard"
import { PropertyLocationEnrichmentCard } from "@/components/property/PropertyLocationEnrichmentCard"
import { RenamePropertyButton } from "@/components/property/RenamePropertyButton"
import { DeletePropertyButton } from "@/components/property/DeletePropertyButton"
import { EditPropertyMetadataButton } from "@/components/property/EditPropertyMetadataButton"
import { RedFlagsList } from "@/components/property/RedFlagsList"
import { SuggestedActionsCard } from "@/components/property/SuggestedActionsCard"
import { GenerateEmailDraftCard } from "@/components/property/GenerateEmailDraftCard"
import { GmailSentToast } from "@/components/property/GmailSentToast"
import { PropertyTimeline } from "@/components/property/PropertyTimeline"
import { PropertyAISummaryCard } from "@/components/property/PropertyAISummaryCard"
import { getGmailConnectionStatus } from "@/app/actions/gmail-connection"
import { StreetViewImage } from "@/components/ui/StreetViewImage"
import { AppShell } from "@/components/AppShell"
import { streetViewUrl } from "@/lib/streetview"

const PropertiesMap = nextDynamic(() => import("@/components/map/PropertiesMap"), { ssr: false })

const DocumentTable = nextDynamic(() => import("@/components/DocumentTable"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-dashboard-primary border-t-transparent"
        aria-hidden
      />
      <p className="text-sm text-dashboard-on-surface-variant">Documenten laden…</p>
    </div>
  ),
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const data = await getPropertyDetail(id)
  if (!data) return { title: "Pand niet gevonden" }
  return {
    title: data.propertyDisplayName,
    description: `Documenten, compliance en bevindingen voor ${data.propertyDisplayName}.`,
  }
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [data, { data: notificationRows, error: notificationsError }, gmailStatus, { data: timelineEvents, error: timelineError }] = await Promise.all([
    getPropertyDetail(id),
    getDashboardNotifications(12),
    getGmailConnectionStatus(),
    getPropertyTimeline(id),
  ])

  if (!data) {
    notFound()
  }

  const propertyOption = [{ id: data.propertyId, display_name: data.propertyDisplayName }]
  const requiredTotal = data.summaryCounts.requiredTotal || 0
  const validCount = data.summaryCounts.validCount || 0
  const criticalIssues =
    data.flags.filter((f) => f.severity === "red").length + (data.stats.missingCount > 0 ? 1 : 0)
  const complianceScore =
    requiredTotal > 0 ? Math.round((validCount / requiredTotal) * 100) : 0
  const hasCoords =
    data.propertyAddress?.latitude != null && data.propertyAddress?.longitude != null
  const mapMarkers = hasCoords
    ? [
        {
          propertyId: data.propertyId,
          displayName: data.propertyDisplayName,
          latitude: Number(data.propertyAddress!.latitude),
          longitude: Number(data.propertyAddress!.longitude),
          addressLabel: data.propertyAddress?.normalized_full_address || data.propertyAddress?.raw_line1 || "—",
          status: data.stats.status,
        },
      ]
    : []

  const svUrl = (() => {
    const addr = data.propertyAddress
    if (addr?.latitude != null && addr?.longitude != null)
      return streetViewUrl({ latitude: Number(addr.latitude), longitude: Number(addr.longitude) }, "640x320")
    return ""
  })()

  const allowMissingDocs = data.missingRequiredDocumentNames.length > 0
  const allowRedFlags = data.flags.some((f) => f.severity === "red" || f.severity === "orange")
  const allowDocumentMismatch = data.flags.some(
    (f) =>
      f.title.toLowerCase().includes("wrong document type") ||
      f.title.toLowerCase().includes("verkeerd documenttype") ||
      f.details.toLowerCase().includes("wrong document") ||
      f.details.toLowerCase().includes("verkeerde rij")
  )

  const topSlot = (
    <nav className="flex items-center gap-2 text-xs text-dashboard-on-surface-variant" aria-label="Breadcrumb">
      <Link href="/" className="hover:text-dashboard-primary transition-colors">Panden</Link>
      <span>›</span>
      <span className="font-semibold text-dashboard-primary">
        {data.propertyAddress?.municipality || data.propertyAddress?.raw_line1 || data.propertyDisplayName}
      </span>
    </nav>
  )

  return (
    <AppShell
      notifications={notificationRows}
      notificationsError={notificationsError}
      topSlot={topSlot}
    >
      <div className="property-detail-bg">
        <div className="mx-auto w-full max-w-7xl space-y-6 p-6 lg:p-8">
          {/* Hero — satellite image with overlay header */}
          <section className="animate-fade-in-up relative h-60 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-dashboard-primary-container/90 via-dashboard-primary/80 to-dashboard-primary shadow-md md:h-64">
            <StreetViewImage
              src={svUrl}
              alt={`Satellietfoto van ${data.propertyDisplayName}`}
              imgClassName="object-cover brightness-[0.6]"
              fallback={
                <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_32px_32px,white_2px,transparent_0)] [background-size:32px_32px]" />
              }
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15" />

            {/* Top overlay: status pill + action buttons */}
            <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-between gap-2 p-4 md:p-5">
              {data.stats.status === "red" ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-red-700 shadow-sm backdrop-blur">
                  <span className="animate-pulse-dot h-2 w-2 rounded-full bg-red-500" aria-hidden />
                  Kritieke actie vereist
                </span>
              ) : data.stats.status === "pending" ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-700 shadow-sm backdrop-blur">
                  <CircleDashed className="h-3 w-3" />
                  Nog te analyseren
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 shadow-sm backdrop-blur">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                  In orde
                </span>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <EditPropertyMetadataButton propertyId={data.propertyId} />
                <RenamePropertyButton propertyId={data.propertyId} currentDisplayName={data.propertyDisplayName} />
                <DeletePropertyButton propertyId={data.propertyId} propertyName={data.propertyDisplayName} redirectToDashboard />
              </div>
            </div>

            {/* Bottom overlay: title + address */}
            <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
              <div className="min-w-0 space-y-1.5 text-white">
                <h1 className="font-headline text-2xl font-extrabold tracking-tight drop-shadow-md md:text-3xl">
                  {data.propertyDisplayName}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-white/90">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    {data.propertyAddress?.normalized_full_address || data.propertyAddress?.raw_line1 || "Adres ontbreekt"}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/60">
                    ID {data.propertyId.slice(0, 8).toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {data.stats.pendingCount > 0 && (
            <div
              className="animate-fade-in-up anim-delay-1 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm"
              role="status"
            >
              <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
              <div className="flex-1">
                <p className="font-semibold text-slate-800">
                  {data.stats.pendingCount === 1
                    ? "1 document is nog niet geanalyseerd"
                    : `${data.stats.pendingCount} documenten zijn nog niet geanalyseerd`}
                </p>
                <p className="mt-0.5 text-slate-600">
                  Klik op &quot;Analyseren&quot; bij het document om de AI-analyse te starten. Pas dan worden bevindingen meegenomen in de nalevingsscore.
                </p>
              </div>
            </div>
          )}

          {/* Bevindingen + Aanbevolen acties — prominent top placement */}
          <div className="animate-fade-in-up anim-delay-2 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <RedFlagsList
              flags={data.flags}
              className="lg:col-span-8"
            />
            <SuggestedActionsCard
              actions={data.suggestedActions}
              className="rounded-xl lg:col-span-4"
            />
          </div>

          {/* Documents + compact score/actions rail */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Documents — primary content */}
            <section
              className="animate-fade-in-up anim-delay-3 saas-card-hover-lift overflow-hidden rounded-xl border border-dashboard-outline-variant/10 bg-white shadow-sm lg:col-span-8"
              aria-label="Documenten"
            >
              <div className="flex items-center justify-between border-b border-dashboard-outline-variant/20 bg-dashboard-surface-low px-5 py-4 lg:px-6">
                <h3 className="flex items-center gap-2 font-headline text-lg font-bold text-dashboard-primary">
                  <FileText className="h-5 w-5" aria-hidden />
                  Verificatiedocumenten
                </h3>
                <span className="text-xs text-dashboard-on-surface-variant">{data.documentTypes.length} documenttypen</span>
              </div>
              <div className="p-5 lg:p-6">
                <DocumentTable propertyId={id} wrapInCard={false} />
              </div>
            </section>

            {/* Sticky rail: score + email + AI summary */}
            <aside className="animate-fade-in-up anim-delay-4 lg:col-span-4">
              <div className="space-y-4 lg:sticky lg:top-20">
                {/* Compliance score */}
                <div className="saas-card-hover-lift relative overflow-hidden rounded-xl bg-gradient-to-br from-dashboard-primary via-dashboard-primary to-[#001b2e] p-5 text-white shadow-lg">
                  <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5 blur-2xl" aria-hidden />
                  {requiredTotal === 0 || (validCount === 0 && criticalIssues === 0) ? (
                    /* Empty / not-yet-analysed placeholder */
                    <div className="relative flex items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-white/40 text-white/70">
                        <Layers3 className="h-6 w-6" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-white/70">Nalevingsscore</p>
                        <p className="mt-0.5 text-base font-semibold text-white">Nog niet beoordeeld</p>
                        <p className="mt-0.5 text-xs text-white/60">Laad documenten op om te starten.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <span className="font-headline text-3xl font-extrabold">{complianceScore}%</span>
                          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest opacity-80">Nalevingsscore</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <p className="text-xl font-extrabold">{validCount}</p>
                            <p className="text-[10px] opacity-70">Geldig</p>
                          </div>
                          <div className="h-8 w-px bg-white/25" />
                          <div className="text-center">
                            <p className="text-xl font-extrabold">{criticalIssues}</p>
                            <p className="text-[10px] opacity-70">Kritiek</p>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                        <div
                          className="animate-grow-bar h-full origin-left rounded-full bg-gradient-to-r from-brand-light to-white"
                          style={{ width: `${complianceScore}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <GenerateEmailDraftCard
                  propertyId={id}
                  allowMissingDocs={allowMissingDocs}
                  allowRedFlags={allowRedFlags}
                  allowDocumentMismatch={allowDocumentMismatch}
                  gmailConnected={gmailStatus.ok && gmailStatus.connected}
                  gmailEmail={gmailStatus.ok && gmailStatus.connected ? gmailStatus.gmailEmail : null}
                />

                <PropertyAISummaryCard
                  summaryCounts={data.summaryCounts}
                  status={data.stats.status}
                />
              </div>
            </aside>
          </div>

          {/* Address + location enrichment */}
          <div className="animate-fade-in-up anim-delay-5 saas-card-hover-lift overflow-hidden rounded-xl border border-[hsl(var(--card-border))] bg-white shadow-sm">
            <div className="p-5 lg:p-6">
              <PropertyAddressCard propertyId={id} address={data.propertyAddress} wrapInCard={false} />
            </div>
            <div className="relative border-t border-[hsl(var(--card-border))] bg-gradient-to-br from-brand-light/[0.08] via-white to-white p-5 lg:p-6">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-light/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-dark">
                <Sparkles className="h-3 w-3" aria-hidden />
                Locatieverrijking
              </div>
              <PropertyLocationEnrichmentCard
                propertyId={id}
                address={data.propertyAddress}
                enrichment={data.locationEnrichment}
                wrapInCard={false}
              />
            </div>
          </div>

          {/* Map */}
          <div className="animate-fade-in-up anim-delay-6 saas-card-hover-lift relative isolate h-[320px] w-full overflow-hidden rounded-xl border border-dashboard-outline-variant/20 bg-dashboard-surface-low shadow-sm">
            {mapMarkers.length > 0 ? (
              <PropertiesMap markers={mapMarkers} className="h-full w-full border-0 shadow-none" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-dashboard-on-surface-variant">
                Geocodeer dit adres om de kaartmarkering te tonen.
              </div>
            )}
          </div>

          {/* Activity timeline */}
          <section aria-label="Tijdlijn" className="animate-fade-in-up anim-delay-6 pt-2">
            <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-dashboard-primary">
              <Clock className="h-5 w-5" />
              Activiteitstijdlijn
            </h3>
            <PropertyTimeline
              events={timelineEvents}
              propertyId={id}
              properties={propertyOption}
              error={timelineError}
            />
          </section>
        </div>
      </div>
      <GmailSentToast />
    </AppShell>
  )
}
