import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { StatusBadge } from "./StatusBadge"
import { StreetViewImage } from "./StreetViewImage"
import { SpotlightCard } from "./SpotlightCard"
import type { PropertyStats } from "@/app/actions/get-dashboard-data"

type PropertyCardProps = {
  id: string
  nameOrAddress: string
  stats: PropertyStats
  streetViewUrl?: string
}

export function PropertyCard({ id, nameOrAddress, stats, streetViewUrl }: PropertyCardProps) {
  const totalDocs = stats.documentCount + stats.missingCount
  const completionPct = totalDocs > 0 ? Math.round((stats.documentCount / totalDocs) * 100) : 0

  return (
    <SpotlightCard className="group flex min-h-[300px] flex-col rounded-xl border border-dashboard-outline-variant/25 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
    <article className="flex flex-1 flex-col">
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-dashboard-primary-container/90 via-dashboard-primary/80 to-dashboard-primary text-white">
        <StreetViewImage
          src={streetViewUrl ?? ""}
          alt={`Satellietfoto van ${nameOrAddress}`}
          imgClassName="object-cover brightness-75"
          fallback={
            <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_24px_24px,white_2px,transparent_0)] [background-size:24px_24px]" />
          }
        />
        <div className="relative flex h-full items-start justify-end p-4">
          <StatusBadge status={stats.status} className="shrink-0 border-white/40 bg-white/90 text-dashboard-primary" />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-dashboard-on-surface">
          {nameOrAddress}
        </h3>
        <p className="mt-0.5 text-xs text-dashboard-on-surface-variant">
          ID {id.slice(0, 8).toUpperCase()}
        </p>

        {/* Document completion */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wide text-dashboard-on-surface-variant">
              Documenten
            </p>
            <p className="text-xs font-semibold text-dashboard-on-surface">
              {stats.documentCount}/{totalDocs}
            </p>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#519fc8] transition-all"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 pb-3 text-xs text-dashboard-on-surface-variant">
          {stats.missingCount > 0 && (
            <span className="text-amber-600">
              {stats.missingCount} ontbreekt
            </span>
          )}
          {stats.expiriesCount > 0 && (
            <span className="text-red-600">
              {stats.expiriesCount} verloopt
            </span>
          )}
          {stats.pendingCount > 0 && (
            <span className="text-slate-600">
              {stats.pendingCount} nog te analyseren
            </span>
          )}
          {stats.missingCount === 0 &&
            stats.expiriesCount === 0 &&
            stats.pendingCount === 0 &&
            stats.status === "green" && (
              <span className="text-green-700">Alle documenten aanwezig en geldig</span>
            )}
        </div>

        <Link
          href={`/properties/${id}`}
          className="mt-auto inline-flex w-full items-center justify-center gap-1 rounded-lg bg-gray-50 py-2.5 text-xs font-bold text-dashboard-primary transition-all hover:bg-dashboard-primary hover:text-white"
        >
          Bekijk pand
          <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </article>
    </SpotlightCard>
  )
}
