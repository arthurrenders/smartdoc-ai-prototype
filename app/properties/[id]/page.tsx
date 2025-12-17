import DocumentTable from "@/components/DocumentTable"

export default function PropertyPage({
  params,
}: {
  params: { id: string }
}) {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Property {params.id}</h1>
        <p className="text-muted-foreground mt-2">
          Document overview and management
        </p>
      </div>
      <DocumentTable propertyId={params.id} />
    </div>
  )
}



