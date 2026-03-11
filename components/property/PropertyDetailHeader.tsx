import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { StatusBadge } from "@/components/ui/StatusBadge"
import type { PropertyStatusResult } from "@/lib/property-status"

type PropertyDetailHeaderProps = {
  propertyId: string
  displayName: string
  stats: PropertyStatusResult
}

export function PropertyDetailHeader({
  propertyId,
  displayName,
  stats,
}: PropertyDetailHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Back to dashboard
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {displayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ID: {propertyId}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <StatusBadge status={stats.status} />
          <span className="text-sm text-muted-foreground">
            {stats.documentCount} document{stats.documentCount !== 1 ? "s" : ""}
            {stats.missingCount > 0 && ` · ${stats.missingCount} missing`}
            {stats.expiriesCount > 0 && ` · ${stats.expiriesCount} expir${stats.expiriesCount !== 1 ? "ies" : "y"} soon`}
          </span>
        </div>
      </div>
    </header>
  )
}
