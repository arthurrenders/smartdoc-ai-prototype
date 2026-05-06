import type { Metadata } from "next"
import { Inbox } from "lucide-react"

export const metadata: Metadata = {
  title: "Intake",
  description: "Upload documenten voor automatische verwerking en pandkoppeling.",
}

import { getIntakeUploads } from "@/app/actions/get-intake-uploads"
import { getIntakePropertyOptions } from "@/app/actions/get-intake-property-options"
import { getDashboardNotifications } from "@/app/actions/get-dashboard-notifications"
import { BulkIntakeClient } from "@/components/intake/BulkIntakeClient"
import { AppShell } from "@/components/AppShell"

export const dynamic = "force-dynamic"

export default async function IntakePage() {
  const [{ data: rows, error }, { data: propertyOptions }, { data: notificationRows, error: notificationsError }] =
    await Promise.all([getIntakeUploads(), getIntakePropertyOptions(), getDashboardNotifications(12)])

  return (
    <AppShell notifications={notificationRows} notificationsError={notificationsError}>
      <div className="mx-auto max-w-5xl space-y-8 p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0e3b6a] text-white shadow-md">
            <Inbox className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-headline text-2xl font-bold tracking-tight text-[#0e3b6a]">
              Document intake
            </h1>
            <p className="text-sm text-muted-foreground">
              Bulk documenten uploaden en verwerken.
            </p>
          </div>
        </div>

        <BulkIntakeClient initialRows={rows} loadError={error} propertyOptions={propertyOptions} />
      </div>
    </AppShell>
  )
}

