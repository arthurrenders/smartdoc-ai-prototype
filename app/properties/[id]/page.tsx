import { notFound } from "next/navigation"
import { getPropertyDetail } from "@/app/actions/get-property-detail"
import DocumentTable from "@/components/DocumentTable"
import { PropertyDetailHeader } from "@/components/property/PropertyDetailHeader"
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
      <div className="mb-8 sm:mb-10">
        <PropertyDetailHeader
          propertyId={data.propertyId}
          displayName={data.propertyDisplayName}
          stats={data.stats}
        />
      </div>

      <section className="mb-8 sm:mb-10" aria-label="Property status">
        <StatusBanner
          status={data.stats.status}
          title={bannerCopy.title}
          description={bannerCopy.description}
        />
      </section>

      <section className="mb-8 sm:mb-10" aria-label="AI summary">
        <PropertyAISummaryCard
          summaryCounts={data.summaryCounts}
          status={data.stats.status}
          fallbackParagraph={data.executiveSummary}
        />
      </section>

      <section className="mb-8 sm:mb-10" aria-label="Issues and flags">
        <RedFlagsList flags={data.flags} />
      </section>

      <section className="mb-8 sm:mb-10" aria-label="Suggested actions">
        <SuggestedActionsCard actions={data.suggestedActions} />
      </section>

      <section aria-label="Documents">
        <div className="saas-card flex flex-col gap-6">
          <div>
            <h2 className="saas-section-heading">Documents</h2>
            <p className="saas-section-subheading">
              Upload PDFs and run AI analysis per document type
            </p>
          </div>
          <DocumentTable propertyId={id} wrapInCard={false} />
        </div>
      </section>
    </div>
  )
}
