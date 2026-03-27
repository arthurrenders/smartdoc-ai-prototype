import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { StatusBadge } from "./StatusBadge"
import type { PropertyStats } from "@/app/actions/get-dashboard-data"

type PropertyCardProps = {
  id: string
  nameOrAddress: string
  stats: PropertyStats
}

export function PropertyCard({ id, nameOrAddress, stats }: PropertyCardProps) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-dashboard-outline-variant/25 bg-dashboard-surface shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-dashboard-primary-container/90 via-dashboard-primary/80 to-dashboard-primary text-white">
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_24px_24px,white_2px,transparent_0)] [background-size:24px_24px]" />
        <div className="relative flex h-full items-start justify-between p-4">
          <p className="max-w-[70%] text-sm font-semibold text-white/90">Property profile</p>
          <StatusBadge status={stats.status} className="shrink-0 border-white/40 bg-white/90 text-dashboard-primary" />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-dashboard-on-surface">{nameOrAddress}</h3>
        <p className="mt-1 text-xs text-dashboard-on-surface-variant">ID {id.slice(0, 8).toUpperCase()}</p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-dashboard-on-surface-variant">Documents</p>
            <p className="text-sm font-bold text-dashboard-on-surface">{stats.documentCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-dashboard-on-surface-variant">Issues</p>
            <p className="text-sm font-bold text-dashboard-on-surface">{stats.missingCount + stats.expiriesCount}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-dashboard-on-surface-variant">
          {stats.missingCount > 0 && (
            <span>{stats.missingCount} missing document{stats.missingCount !== 1 ? "s" : ""}</span>
          )}
          {stats.expiriesCount > 0 && (
            <span>{stats.expiriesCount} upcoming expir{stats.expiriesCount !== 1 ? "ies" : "y"}</span>
          )}
          {stats.missingCount === 0 && stats.expiriesCount === 0 && (
            <span>{stats.documentCount} document{stats.documentCount !== 1 ? "s" : ""}</span>
          )}
        </div>
        <Link
          href={`/properties/${id}`}
          className="mt-5 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-dashboard-surface-low py-2.5 text-xs font-bold text-dashboard-primary transition-all hover:bg-dashboard-primary hover:text-white"
        >
          View property
          <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </article>
  )
}
