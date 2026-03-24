import { notFound } from "next/navigation"
import { getPropertyDetail } from "@/app/actions/get-property-detail"
import DocumentTable from "@/components/DocumentTable"
import { PropertyDetailHeader } from "@/components/property/PropertyDetailHeader"
import { PropertyAddressCard } from "@/components/property/PropertyAddressCard"
import { PropertyLocationEnrichmentCard } from "@/components/property/PropertyLocationEnrichmentCard"
import { StatusBanner } from "@/components/property/StatusBanner"
import { PropertyAISummaryCard } from "@/components/property/PropertyAISummaryCard"
import { RedFlagsList } from "@/components/property/RedFlagsList"
import { SuggestedActionsCard } from "@/components/property/SuggestedActionsCard"

const STATUS_BANNER_COPY: Record<
  "green" | "orange" | "red",
  { title: string; description: string }
> = {
  green: {
    title: "All documents in order",
    description:
      "Required documents are present and analyzed. No critical issues or missing certificates.",
  },
  orange:
    {
      title: "Attention needed",
      description:
        "Some documents are missing, have warnings, or have upcoming expiries. Review the suggested actions below.",
    },
  red:
    {
      title: "Critical issues",
      description:
        "Required documents are missing or critical compliance issues were found. Address these before closing.",
    },
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const data = await getPropertyDetail(id)

  if (!data) {
    notFound()
  }

  const bannerCopy = STATUS_BANNER_COPY[data.stats.status]

  return (
    <div className="saas-page">
      <div className="mb-10 sm:mb-12">
        <div className="rounded-2xl border border-[hsl(var(--card-border))] bg-white p-6 shadow-md sm:p-8 dark:bg-card">
          <PropertyDetailHeader
            propertyId={data.propertyId}
            displayName={data.propertyDisplayName}
            stats={data.stats}
          />
        </div>
      </div>

      <div
        className="space-y-8 border-b border-[hsl(var(--border))]/60 pb-12 sm:space-y-10 sm:pb-16"
        aria-label="Locatie"
      >
        <section aria-label="Property address">
          <PropertyAddressCard propertyId={id} address={data.propertyAddress} />
        </section>

        <section aria-label="Property location enrichment">
          <PropertyLocationEnrichmentCard
            propertyId={id}
            address={data.propertyAddress}
            enrichment={data.locationEnrichment}
          />
        </section>
      </div>

      <div
        className="mt-10 space-y-8 border-b border-[hsl(var(--border))]/60 pb-12 sm:mt-12 sm:space-y-10 sm:pb-16"
        aria-label="Samenvatting documenten"
      >
        <section aria-label="Property status">
          <StatusBanner
            status={data.stats.status}
            title={bannerCopy.title}
            description={bannerCopy.description}
          />
        </section>

        <section aria-label="AI summary">
          <PropertyAISummaryCard
            summaryCounts={data.summaryCounts}
            status={data.stats.status}
            fallbackParagraph={data.executiveSummary}
          />
        </section>
      </div>

      <div className="mt-10 space-y-8 sm:mt-12 sm:space-y-10" aria-label="Acties en issues">
        <section aria-label="Issues and flags">
          <RedFlagsList flags={data.flags} />
        </section>

        <section aria-label="Suggested actions">
          <SuggestedActionsCard actions={data.suggestedActions} />
        </section>
      </div>

      <section className="mt-10 sm:mt-12" aria-label="Documents">
        <div className="saas-card flex flex-col gap-8">
          <div>
            <h2 className="saas-section-heading text-xl sm:text-2xl">Documents</h2>
            <p className="saas-section-subheading mt-2">
              Upload PDFs and run AI analysis per document type
            </p>
          </div>
          <DocumentTable propertyId={id} wrapInCard={false} />
        </div>
      </section>
    </div>
  )
}
