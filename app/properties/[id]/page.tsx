import type { Metadata } from "next"
import { notFound } from "next/navigation"
import nextDynamic from "next/dynamic"
import Link from "next/link"
import {
  Layers3,
  AlertTriangle,
  Clock,
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
import { StatusBadge } from "@/components/ui/StatusBadge"
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
      f.details.toLowerCase().includes("wrong document")
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
      <div className="mx-auto w-full max-w-7xl space-y-8 p-8">
        {/* Page header */}
        <section className="flex flex-col justify-between gap-4 border-b border-dashboard-surface-variant/60 pb-5 md:flex-row md:items-end">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="font-headline text-2xl font-bold tracking-tight text-dashboard-primary">
                {data.propertyDisplayName}
              </h1>
              {data.stats.status === "red" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-700">
                  <AlertTriangle className="h-3 w-3" />
                  Kritieke actie vereist
                </span>
              ) : (
                <StatusBadge status={data.stats.status} />
              )}
            </div>
            <span className="font-mono text-xs text-dashboard-on-surface-variant">
              ID: {data.propertyId.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <EditPropertyMetadataButton propertyId={data.propertyId} />
            <RenamePropertyButton propertyId={data.propertyId} currentDisplayName={data.propertyDisplayName} />
            <DeletePropertyButton propertyId={data.propertyId} propertyName={data.propertyDisplayName} redirectToDashboard />
          </div>
        </section>

        {/* Satellite image banner */}
        <div className="relative h-52 w-full overflow-hidden rounded-xl bg-gradient-to-br from-dashboard-primary-container/90 via-dashboard-primary/80 to-dashboard-primary shadow-sm">
          <StreetViewImage
            src={svUrl}
            alt={`Satellietfoto van ${data.propertyDisplayName}`}
            imgClassName="object-cover brightness-90"
            fallback={
              <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_32px_32px,white_2px,transparent_0)] [background-size:32px_32px]" />
            }
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-5 text-white drop-shadow">
            <p className="text-xs font-semibold uppercase tracking-widest opacity-75">Satellietfoto</p>
            <p className="mt-0.5 text-sm font-bold">
              {data.propertyAddress?.normalized_full_address || data.propertyAddress?.raw_line1 || data.propertyDisplayName}
            </p>
          </div>
        </div>

        {/* Documents + compact score/actions sidebar — sidebar is transparent, stretches to match doc height */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Documents — primary content */}
          <section className="rounded-xl border border-dashboard-outline-variant/10 bg-white shadow-sm lg:col-span-8" aria-label="Documenten">
            <div className="flex items-center justify-between border-b border-dashboard-outline-variant/20 bg-dashboard-surface-low px-6 py-4">
              <h3 className="font-headline text-lg font-bold text-dashboard-primary">Verificatiedocumenten</h3>
              <span className="text-xs text-dashboard-on-surface-variant">{data.documentTypes.length} documentstypen</span>
            </div>
            <div className="p-6">
              <DocumentTable propertyId={id} wrapInCard={false} />
            </div>
          </section>

          {/* Sidebar: score + actions + email anchored to bottom */}
          <div className="flex flex-col lg:col-span-4">
            {/* Compliance score */}
            <div className="rounded-xl bg-dashboard-primary p-5 text-white shadow-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="font-headline text-3xl font-extrabold">{complianceScore}%</span>
                  <p className="mt-0.5 text-xs font-bold uppercase tracking-widest opacity-80">Nalevingsscore</p>
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
                  <Layers3 className="h-6 w-6 shrink-0 opacity-40" />
                </div>
              </div>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-white transition-all" style={{ width: `${complianceScore}%` }} />
              </div>
            </div>

            <div className="mt-4">
              <SuggestedActionsCard actions={data.suggestedActions} className="rounded-xl" />
            </div>

            <div className="mt-4">
              <GenerateEmailDraftCard
                propertyId={id}
                allowMissingDocs={allowMissingDocs}
                allowRedFlags={allowRedFlags}
                allowDocumentMismatch={allowDocumentMismatch}
                gmailConnected={gmailStatus.ok && gmailStatus.connected}
                gmailEmail={gmailStatus.ok && gmailStatus.connected ? gmailStatus.gmailEmail : null}
              />
            </div>

            <div className="mt-4">
              <PropertyAISummaryCard
                summaryCounts={data.summaryCounts}
                status={data.stats.status}
              />
            </div>
          </div>
        </div>

        {/* Address + location — full width so expanding location enrichment never disrupts the layout above */}
        <div className="overflow-hidden rounded-xl border border-[hsl(var(--card-border))] bg-white shadow-sm">
          <div className="divide-y divide-[hsl(var(--card-border))]">
            <div className="p-6">
              <PropertyAddressCard propertyId={id} address={data.propertyAddress} wrapInCard={false} />
            </div>
            <div className="border-l-4 border-l-brand-light/55 bg-gradient-to-r from-brand-light/8 to-transparent p-6">
              <PropertyLocationEnrichmentCard
                propertyId={id}
                address={data.propertyAddress}
                enrichment={data.locationEnrichment}
                wrapInCard={false}
              />
            </div>
          </div>
        </div>

        {/* Red flags */}
        <RedFlagsList flags={data.flags} className="rounded-xl border border-dashboard-outline-variant/10 bg-white shadow-sm" />

        {/* Map */}
        <div className="relative isolate h-[320px] w-full overflow-hidden rounded-xl border border-dashboard-outline-variant/20 bg-dashboard-surface-low shadow-sm">
          {mapMarkers.length > 0 ? (
            <PropertiesMap markers={mapMarkers} className="h-full w-full border-0 shadow-none" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-dashboard-on-surface-variant">
              Geocodeer dit adres om de kaartmarkering te tonen.
            </div>
          )}
        </div>

        {/* Activity timeline */}
        <section aria-label="Tijdlijn" className="mt-8">
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
      <GmailSentToast />
    </AppShell>
  )
}
