import Link from "next/link"
import { ArrowLeft, Inbox } from "lucide-react"

import { getIntakeUploads } from "@/app/actions/get-intake-uploads"
import { getIntakePropertyOptions } from "@/app/actions/get-intake-property-options"
import { BulkIntakeClient } from "@/components/intake/BulkIntakeClient"

export const dynamic = "force-dynamic"

export default async function IntakePage() {
  const { data: rows, error } = await getIntakeUploads()
  const { data: propertyOptions } = await getIntakePropertyOptions()

  return (
    <div className="saas-page space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#519fc8] hover:text-[#0e3b6a]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0e3b6a] text-white shadow-md">
              <Inbox className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-headline text-3xl font-bold tracking-tight text-[#0e3b6a] sm:text-4xl">
                Document intake
              </h1>
              <p className="text-sm text-muted-foreground">
                Bulk upload compliance documents. Files are stored in Supabase and registered for processing.
              </p>
            </div>
          </div>
        </div>
      </div>

      <BulkIntakeClient initialRows={rows} loadError={error} propertyOptions={propertyOptions} />
    </div>
  )
}
