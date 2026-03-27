import nextDynamic from "next/dynamic"
import Link from "next/link"
import {
  Bell,
  Building2,
  CircleHelp,
  FileDown,
  LayoutDashboard,
  Layers3,
  Map as MapIcon,
  MapPin,
  Search,
  Settings,
  UserCircle2,
  Plus,
  Filter,
} from "lucide-react"
import { getMapMarkers } from "@/app/actions/get-map-markers"
import { StatusBadge } from "@/components/ui/StatusBadge"

export const dynamic = "force-dynamic"

const PropertiesMap = nextDynamic(() => import("@/components/map/PropertiesMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-full w-full items-center justify-center bg-dashboard-surface-low text-sm text-dashboard-on-surface-variant"
      aria-busy="true"
    >
      Kaart laden…
    </div>
  ),
})

export default async function MapPage() {
  const { markers, error } = await getMapMarkers()

  return (
    <div className="-mt-10 overflow-hidden sm:-mt-12 lg:-mt-16">
      <div className="dashboard-shell h-screen">
        <aside className="dashboard-sidenav">
          <div className="p-6">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dashboard-primary text-white">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-dashboard-primary">SmartDoc AI</h2>
                <p className="text-[10px] uppercase tracking-[0.22em] text-dashboard-on-surface-variant/70">
                  Editorial Intelligence
                </p>
              </div>
            </div>
            <Link
              href="/properties/new"
              className="mb-8 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-dashboard-primary px-4 py-3 text-sm font-bold text-white transition-all hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              New Report
            </Link>
            <nav className="space-y-1">
              <Link
                href="/"
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-dashboard-primary"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <Link
                href="/map"
                className="flex items-center gap-3 border-r-4 border-dashboard-primary bg-slate-100 px-4 py-3 text-sm font-bold text-dashboard-primary"
              >
                <MapIcon className="h-4 w-4" />
                Map View
              </Link>
              <a
                href="#"
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-dashboard-primary"
              >
                <Building2 className="h-4 w-4" />
                Properties
              </a>
            </nav>
          </div>
          <div className="mt-auto border-t border-dashboard-outline-variant/40 p-6">
            <nav className="space-y-1">
              <a
                href="#"
                className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:text-dashboard-primary"
              >
                <Settings className="h-4 w-4" />
                Settings
              </a>
              <a
                href="#"
                className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:text-dashboard-primary"
              >
                <CircleHelp className="h-4 w-4" />
                Support
              </a>
            </nav>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-dashboard-background">
          <header className="dashboard-topnav px-8">
            <div className="flex flex-1 items-center gap-8">
              <div className="relative hidden w-64 lg:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dashboard-outline-variant" />
                <input
                  className="w-full rounded-full border-none bg-dashboard-surface-low py-2 pl-10 pr-4 text-xs focus:outline-none focus:ring-2 focus:ring-dashboard-primary/20"
                  placeholder="Search geolocations..."
                  type="text"
                />
              </div>
              <nav className="hidden gap-6 md:flex">
                <a className="text-sm font-normal text-slate-500 transition-all hover:text-dashboard-primary" href="#">
                  Overview
                </a>
                <a className="text-sm font-normal text-slate-500 transition-all hover:text-dashboard-primary" href="#">
                  Analytics
                </a>
                <a
                  className="translate-y-[2px] border-b-2 border-dashboard-primary pb-5 text-sm font-semibold text-dashboard-primary"
                  href="#"
                >
                  Reports
                </a>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <button className="inline-flex items-center gap-2 rounded-lg bg-dashboard-surface-high px-4 py-2 text-sm font-medium text-dashboard-primary transition-colors hover:bg-dashboard-surface-variant">
                <FileDown className="h-4 w-4" />
                Export Data
              </button>
              <div className="flex gap-2">
                <button className="flex h-10 w-10 items-center justify-center rounded-full text-dashboard-on-surface-variant transition-colors hover:bg-dashboard-surface-low">
                  <Bell className="h-5 w-5" />
                </button>
                <button className="flex h-10 w-10 items-center justify-center rounded-full text-dashboard-on-surface-variant transition-colors hover:bg-dashboard-surface-low">
                  <UserCircle2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          </header>

          <div className="border-b border-dashboard-surface bg-white px-8 py-6">
            <div className="flex items-end justify-between">
              <div>
                <nav className="mb-2 flex items-center gap-2 text-xs text-dashboard-on-surface-variant">
                  <span>Properties</span>
                  <span>›</span>
                  <span className="font-semibold text-dashboard-primary">Map View</span>
                </nav>
                <h1 className="text-3xl font-extrabold tracking-tight text-dashboard-primary">
                  Properties on the Map
                </h1>
                <p className="mt-1 text-sm text-dashboard-on-surface-variant">
                  Showing {markers.length} {markers.length === 1 ? "asset" : "assets"} with geocoded coordinates.
                </p>
              </div>
              <div className="hidden rounded-lg border border-dashboard-outline-variant/30 md:flex">
                <button className="inline-flex items-center gap-2 border-r border-dashboard-outline-variant/30 bg-white px-4 py-2 text-dashboard-on-surface-variant transition-colors hover:bg-dashboard-surface-low">
                  <Filter className="h-4 w-4" />
                  <span className="text-sm font-medium">Filter</span>
                </button>
                <button className="inline-flex items-center gap-2 bg-dashboard-primary px-4 py-2 text-white">
                  <Layers3 className="h-4 w-4" />
                  <span className="text-sm font-medium">Satellite</span>
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div
              className="mx-8 mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              Kaartgegevens konden niet geladen worden: {error}
            </div>
          )}

          {!error && markers.length === 0 ? (
            <div className="m-8 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-dashboard-outline-variant/50 bg-dashboard-surface px-6 py-14 text-center">
              <MapPin className="h-14 w-14 text-dashboard-on-surface-variant/35" aria-hidden />
              <p className="mt-5 text-base font-semibold text-dashboard-on-surface">Nog geen punten op de kaart</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-dashboard-on-surface-variant">
                Geocode een adres op een panddetailpagina (knop &quot;Geocode adres (België)&quot;).
                Daarna verschijnt het pand hier.
              </p>
            </div>
          ) : !error ? (
            <section className="relative flex min-h-0 flex-1 overflow-hidden" aria-label="Kaart met panden">
              <aside className="z-20 hidden w-96 flex-col border-r border-dashboard-surface bg-white shadow-xl shadow-slate-900/5 lg:flex">
                <div className="border-b border-dashboard-surface-low bg-dashboard-surface p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-bold text-dashboard-primary">Property List</h3>
                    <span className="rounded-full bg-dashboard-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-dashboard-on-secondary-container">
                      {markers.length} assets
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 rounded-lg border border-dashboard-primary/10 bg-dashboard-surface-low px-3 py-2 text-xs font-semibold text-dashboard-primary">
                      Active
                    </button>
                    <button className="flex-1 rounded-lg border border-dashboard-outline-variant/20 bg-white px-3 py-2 text-xs font-medium text-dashboard-on-surface-variant hover:bg-dashboard-surface-low">
                      Pending
                    </button>
                    <button className="flex-1 rounded-lg border border-dashboard-outline-variant/20 bg-white px-3 py-2 text-xs font-medium text-dashboard-on-surface-variant hover:bg-dashboard-surface-low">
                      Sold
                    </button>
                  </div>
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto bg-dashboard-surface-low/30 p-2">
                  {markers.map((marker, idx) => (
                    <Link
                      key={marker.propertyId}
                      href={`/properties/${marker.propertyId}`}
                      className={`block rounded-xl border p-4 transition-all ${
                        idx === 0
                          ? "border-dashboard-outline-variant/20 border-l-4 border-l-dashboard-primary bg-white shadow-sm"
                          : "border-transparent hover:border-dashboard-surface hover:bg-white"
                      }`}
                    >
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-dashboard-on-surface-variant">
                          {marker.propertyId.slice(0, 8).toUpperCase()}
                        </span>
                        <StatusBadge status={marker.status} />
                      </div>
                      <h4 className="font-bold text-dashboard-on-surface transition-colors hover:text-dashboard-primary">
                        {marker.displayName}
                      </h4>
                      <p className="mt-1 line-clamp-2 text-xs text-dashboard-on-surface-variant">
                        {marker.addressLabel}
                      </p>
                    </Link>
                  ))}
                </div>
              </aside>
              <div className="min-h-0 min-w-0 flex-1 bg-dashboard-surface">
                <PropertiesMap
                  markers={markers}
                  className="z-0 h-full w-full border-t border-dashboard-surface shadow-none"
                />
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  )
}
