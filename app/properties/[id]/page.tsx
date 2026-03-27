import { notFound } from "next/navigation"
import nextDynamic from "next/dynamic"
import Link from "next/link"
import Image from "next/image"
import {
  Building2,
  Filter,
  LayoutDashboard,
  Layers3,
  Map as MapIcon,
  Plus,
  Search,
  Settings,
  MapPin,
  AlertTriangle,
} from "lucide-react"
import { getPropertyDetail } from "@/app/actions/get-property-detail"
import { getDashboardNotifications } from "@/app/actions/get-dashboard-notifications"
import DocumentTable from "@/components/DocumentTable"
import { PropertyAddressCard } from "@/components/property/PropertyAddressCard"
import { PropertyLocationEnrichmentCard } from "@/components/property/PropertyLocationEnrichmentCard"
import { RenamePropertyButton } from "@/components/property/RenamePropertyButton"
import { DeletePropertyButton } from "@/components/property/DeletePropertyButton"
import { RedFlagsList } from "@/components/property/RedFlagsList"
import { SuggestedActionsCard } from "@/components/property/SuggestedActionsCard"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { NotificationsBellDropdown } from "@/components/navigation/NotificationsBellDropdown"
import { ExportDataButton } from "@/components/navigation/ExportDataButton"
import logoImage from "@/components/public/logo png.png"

const PropertiesMap = nextDynamic(() => import("@/components/map/PropertiesMap"), { ssr: false })

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [data, { data: notificationRows, error: notificationsError }] = await Promise.all([
    getPropertyDetail(id),
    getDashboardNotifications(12),
  ])

  if (!data) {
    notFound()
  }

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

  return (
    <div className="-mt-10 overflow-hidden sm:-mt-12 lg:-mt-16">
      <div className="dashboard-shell min-h-screen">
        <aside className="dashboard-sidenav">
          <div className="p-6">
            <div className="mb-6 px-4">
              <Image
                src={logoImage}
                alt="SmartDoc AI logo"
                width={528}
                height={132}
                className="h-24 w-auto max-w-full object-contain"
                priority
              />
            </div>
            <nav className="mt-8 space-y-2">
              <Link href="/" className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-dashboard-primary">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link href="/map" className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-dashboard-primary">
                <MapIcon className="h-4 w-4" />
                Map View
              </Link>
              <a href="#" className="flex items-center gap-3 border-r-4 border-dashboard-primary bg-slate-100 px-4 py-2.5 text-sm font-bold text-dashboard-primary">
                <Building2 className="h-4 w-4" />
                Properties
              </a>
            </nav>
            <div className="mt-6 px-0">
              <Link href="/properties/new" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-dashboard-primary py-3 text-sm font-bold text-white hover:opacity-90">
                <Plus className="h-4 w-4" />
                New Property
              </Link>
            </div>
          </div>
          <div className="mt-auto border-t border-dashboard-outline-variant/40 p-4">
            <Link href="/settings" className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-dashboard-primary">
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </div>
        </aside>

        <main className="flex flex-1 flex-col overflow-y-auto">
          <header className="dashboard-topnav">
            <div className="flex min-w-0 flex-1 items-center gap-4 lg:gap-8">
              <div className="group relative hidden w-56 md:block lg:w-64 xl:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dashboard-on-surface-variant" />
                <input
                  className="w-full cursor-not-allowed rounded-full border-none bg-dashboard-surface-low py-1.5 pl-10 pr-4 text-sm opacity-70"
                  placeholder="Use search on Dashboard or Map View"
                  type="text"
                  disabled
                  aria-disabled="true"
                />
              </div>
              <nav className="flex min-w-0 items-center gap-4 lg:gap-6">
                <a className="inline-flex h-12 items-center border-b-2 border-dashboard-primary text-sm font-semibold text-dashboard-primary" href="#">Overview</a>
                <Link href="/analytics" className="py-2 text-sm text-slate-500 transition-colors hover:text-dashboard-primary">Analytics</Link>
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-2 md:gap-4">
              <ExportDataButton />
              <NotificationsBellDropdown
                notifications={notificationRows}
                error={notificationsError}
              />
            </div>
          </header>

          <div className="mx-auto w-full max-w-7xl space-y-8 p-8">
            <section className="flex flex-col justify-between gap-6 border-b border-dashboard-surface-variant/60 pb-4 md:flex-row md:items-end">
              <div className="space-y-2">
                <nav className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-dashboard-on-surface-variant">
                  <span>Properties</span>
                  <span>›</span>
                  <span className="font-semibold text-dashboard-primary">Leuven</span>
                </nav>
                <h1 className="font-headline text-4xl font-extrabold tracking-tight text-dashboard-primary">
                  {data.propertyDisplayName}
                </h1>
                <div className="mt-2 flex items-center gap-4">
                  <span className="font-mono text-xs text-dashboard-on-surface-variant">ID: {data.propertyId.slice(0, 8).toUpperCase()}</span>
                  {data.stats.status === "red" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-dashboard-error-container px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-dashboard-on-error-container">
                      <AlertTriangle className="h-3 w-3" />
                      Critical Action Required
                    </span>
                  ) : (
                    <StatusBadge status={data.stats.status} />
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <RenamePropertyButton propertyId={data.propertyId} currentDisplayName={data.propertyDisplayName} />
                <DeletePropertyButton propertyId={data.propertyId} propertyName={data.propertyDisplayName} redirectToDashboard />
              </div>
            </section>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <div className="space-y-8 lg:col-span-8">
                <div className="relative h-[400px] w-full overflow-hidden rounded-xl border border-dashboard-outline-variant/20 bg-dashboard-surface-low shadow-sm">
                  {mapMarkers.length > 0 ? (
                    <PropertiesMap markers={mapMarkers} className="h-full w-full border-0 shadow-none" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-dashboard-on-surface-variant">
                      Geocode this address to display its map marker.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                  <PropertyAddressCard propertyId={id} address={data.propertyAddress} />
                  <PropertyLocationEnrichmentCard
                    propertyId={id}
                    address={data.propertyAddress}
                    enrichment={data.locationEnrichment}
                  />
                </div>

                <section className="rounded-xl border border-dashboard-outline-variant/10 bg-dashboard-surface shadow-sm" aria-label="Documents">
                  <div className="flex items-center justify-between border-b border-dashboard-outline-variant/20 bg-dashboard-surface-low px-6 py-4">
                    <h3 className="font-headline text-lg font-bold text-dashboard-primary">Verification Documents</h3>
                    <span className="text-xs text-dashboard-on-surface-variant">{data.documentTypes.length} total document types</span>
                  </div>
                  <div className="p-6">
                    <DocumentTable propertyId={id} wrapInCard={false} />
                  </div>
                </section>
              </div>

              <div className="space-y-6 lg:col-span-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-4 rounded-xl bg-dashboard-primary p-6 text-white shadow-xl">
                    <div className="flex items-start justify-between">
                      <span className="font-headline text-4xl font-extrabold">{complianceScore}%</span>
                      <Layers3 className="h-8 w-8 opacity-50" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-widest opacity-80">Compliance Score</h4>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                        <div className="h-full bg-white" style={{ width: `${complianceScore}%` }} />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-100 p-4">
                    <div className="text-xl font-extrabold text-emerald-800">{validCount}</div>
                    <div className="text-[10px] font-bold uppercase text-emerald-900/60">Valid Points</div>
                  </div>
                  <div className="rounded-xl border border-dashboard-error/20 bg-dashboard-error-container p-4">
                    <div className="text-xl font-extrabold text-dashboard-on-error-container">{criticalIssues}</div>
                    <div className="text-[10px] font-bold uppercase text-dashboard-on-error-container/70">Critical Issues</div>
                  </div>
                </div>

                <RedFlagsList flags={data.flags} className="rounded-xl border border-dashboard-outline-variant/10 bg-white shadow-sm" />
                <SuggestedActionsCard actions={data.suggestedActions} className="rounded-xl" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
