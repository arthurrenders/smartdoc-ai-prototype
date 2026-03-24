import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { StatusBadge } from "@/components/ui/StatusBadge"
import type { PropertyStatusResult } from "@/lib/property-status"
import { RenamePropertyButton } from "./RenamePropertyButton"
import { DeletePropertyButton } from "./DeletePropertyButton"

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
    <header className="flex flex-col gap-5">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-all duration-200 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Back to dashboard
      </Link>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
            <div className="flex flex-wrap items-start gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {displayName}
              </h1>
              <RenamePropertyButton
                propertyId={propertyId}
                currentDisplayName={displayName}
              />
              <DeletePropertyButton
                propertyId={propertyId}
                propertyName={displayName}
                redirectToDashboard
              />
            </div>
          <p className="mt-2 text-xs text-muted-foreground sm:text-sm">
            ID: {propertyId}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
          <StatusBadge status={stats.status} />
          <span className="max-w-xs text-right text-sm leading-relaxed text-muted-foreground sm:text-left">
            {stats.documentCount} document{stats.documentCount !== 1 ? "s" : ""}
            {stats.missingCount > 0 && ` · ${stats.missingCount} missing`}
            {stats.expiriesCount > 0 && ` · ${stats.expiriesCount} expir${stats.expiriesCount !== 1 ? "ies" : "y"} soon`}
          </span>
        </div>
      </div>
    </header>
  )
}
