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
    <article className="saas-card-interactive group flex h-full flex-col gap-6">
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--border))]/60 pb-4">
          <h3 className="min-w-0 flex-1 text-lg font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
            {nameOrAddress}
          </h3>
          <StatusBadge status={stats.status} className="shrink-0" />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
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
      </div>
      <Link
        href={`/properties/${id}`}
        className="saas-btn-primary mt-auto w-full justify-center transition-all duration-200 sm:w-full sm:justify-center"
      >
        View property
        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </article>
  )
}
