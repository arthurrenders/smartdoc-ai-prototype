import {
  Building2,
  AlertTriangle,
  FileQuestion,
  CalendarClock,
} from "lucide-react"
import { getDashboardData } from "@/app/actions/get-dashboard-data"
import { StatCard } from "@/components/ui/StatCard"
import { PropertyCard } from "@/components/ui/PropertyCard"

function formatPropertyName(id: string): string {
  return `Property ${id.slice(0, 8)}`
}

export default async function DashboardPage() {
  const { properties, propertyStats } = await getDashboardData()

  const totalProperties = properties.length
  const propertiesWithIssues = properties.filter(
    (p) => propertyStats[p.id]?.status !== "green"
  ).length
  const totalMissing = properties.reduce(
    (sum, p) => sum + (propertyStats[p.id]?.missingCount ?? 0),
    0
  )
  const totalExpiries = properties.reduce(
    (sum, p) => sum + (propertyStats[p.id]?.expiriesCount ?? 0),
    0
  )

  return (
    <div className="saas-page">
      {/* Header */}
      <header className="mb-8 sm:mb-10">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          Property Dashboard
        </h1>
        <p className="mt-1.5 text-base text-muted-foreground sm:text-lg">
          Overview of your properties and document compliance status
        </p>
      </header>

      {/* Summary stats */}
      <section className="mb-8 sm:mb-10" aria-label="Summary statistics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total properties"
            value={totalProperties}
            icon={<Building2 className="h-5 w-5" />}
          />
          <StatCard
            title="Properties with issues"
            value={propertiesWithIssues}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <StatCard
            title="Missing documents"
            value={totalMissing}
            icon={<FileQuestion className="h-5 w-5" />}
          />
          <StatCard
            title="Upcoming expiries"
            value={totalExpiries}
            icon={<CalendarClock className="h-5 w-5" />}
          />
        </div>
      </section>

      {/* Property grid */}
      <section aria-label="Properties">
        <h2 className="saas-section-heading mb-4 sm:mb-6">Properties</h2>
        {properties.length === 0 ? (
          <div className="saas-empty-state">
            <Building2 className="h-12 w-12 sm:h-14 sm:w-14 saas-empty-state-icon" aria-hidden />
            <p className="saas-empty-state-title">No properties yet</p>
            <p className="saas-empty-state-description">
              Add a property or set DEMO_PROPERTY_ID in .env to see a demo property.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {properties.map((prop) => (
              <PropertyCard
                key={prop.id}
                id={prop.id}
                nameOrAddress={formatPropertyName(prop.id)}
                stats={propertyStats[prop.id] ?? { missingCount: 0, expiriesCount: 0, status: "red", documentCount: 0 }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
