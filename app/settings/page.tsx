import { Suspense } from "react"
import { Save, User, SlidersHorizontal, KeyRound, Bell } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { getGmailConnectionStatus } from "@/app/actions/gmail-connection"
import { GmailSettingsSection } from "@/components/settings/GmailSettingsSection"
import { getOwnerUserId } from "@/lib/supabase/ownership"

export const dynamic = "force-dynamic"

type SettingsAccount = {
  name: string
  email: string
}

async function getAccountInfo(): Promise<SettingsAccount> {
  const fallback: SettingsAccount = {
    name: "SmartDoc User",
    email: "Not available",
  }

  try {
    const supabase = createServerClient()
    const ownerUserId = await getOwnerUserId(supabase)

    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(
      ownerUserId
    )
    if (userErr || !userData?.user) return fallback

    const metadata = userData.user.user_metadata ?? {}
    const inferredName =
      metadata.full_name ||
      metadata.name ||
      metadata.first_name ||
      userData.user.email?.split("@")[0] ||
      fallback.name

    return {
      name: String(inferredName),
      email: userData.user.email ?? fallback.email,
    }
  } catch {
    return fallback
  }
}

export default async function SettingsPage() {
  const [account, gmailStatus] = await Promise.all([getAccountInfo(), getGmailConnectionStatus()])

  return (
    <div className="saas-page space-y-8">
      <header className="space-y-2">
        <h1 className="font-headline text-3xl font-bold tracking-tight text-brand-dark sm:text-4xl">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage account details and SmartDoc preferences.
        </p>
      </header>

      <Suspense
        fallback={<section className="saas-card h-32 animate-pulse rounded-xl bg-muted/30" aria-hidden />}
      >
        <GmailSettingsSection initialStatus={gmailStatus} />
      </Suspense>

      <form className="space-y-6">
        <section className="saas-card space-y-5">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-brand-dark">
            <User className="h-5 w-5 text-brand-light" />
            Account Information
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                User name
              </span>
              <input
                value={account.name}
                readOnly
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-muted/30 px-3 py-2 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Email
              </span>
              <input
                value={account.email}
                readOnly
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-muted/30 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Account fields are read-only for now.
          </p>
        </section>

        <section className="saas-card space-y-5">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-brand-dark">
            <SlidersHorizontal className="h-5 w-5 text-brand-light" />
            App Preferences
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Default country
              </span>
              <select
                defaultValue="BE"
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm"
              >
                <option value="BE">Belgium</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Language
              </span>
              <select
                defaultValue="nl"
                className="w-full rounded-lg border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm"
              >
                <option value="nl">Nederlands (NL)</option>
                <option value="en">English (EN)</option>
              </select>
            </label>
          </div>
        </section>

        <section className="saas-card space-y-5">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-brand-dark">
            <KeyRound className="h-5 w-5 text-brand-light" />
            Future-ready
          </h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-muted/20 p-4">
              <p className="text-sm font-medium text-foreground">API keys</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Placeholder for Google Maps and other integration keys.
              </p>
            </div>
            <div className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-muted/20 p-4">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                <Bell className="h-4 w-4 text-brand-light" />
                Notification preferences
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Placeholder for e-mail and in-app notification settings.
              </p>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-dark px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0b3158]"
          >
            <Save className="h-4 w-4" />
            Save settings
          </button>
        </div>
      </form>
    </div>
  )
}


