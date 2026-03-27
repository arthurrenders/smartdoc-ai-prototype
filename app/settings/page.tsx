import { Save, User, SlidersHorizontal, KeyRound, Bell } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"

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
    const { data: propRow, error: propErr } = await supabase
      .from("properties")
      .select("user_id")
      .limit(1)
      .maybeSingle()

    if (propErr || !propRow?.user_id) return fallback

    const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(
      String(propRow.user_id)
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
  const account = await getAccountInfo()

  return (
    <div className="saas-page space-y-8">
      <header className="space-y-2">
        <h1 className="font-headline text-3xl font-bold tracking-tight text-[#0e3b6a] sm:text-4xl">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage account details and SmartDoc preferences.
        </p>
      </header>

      <form className="space-y-6">
        <section className="saas-card space-y-5">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[#0e3b6a]">
            <User className="h-5 w-5 text-[#519fc8]" />
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
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[#0e3b6a]">
            <SlidersHorizontal className="h-5 w-5 text-[#519fc8]" />
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
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[#0e3b6a]">
            <KeyRound className="h-5 w-5 text-[#519fc8]" />
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
                <Bell className="h-4 w-4 text-[#519fc8]" />
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
            className="inline-flex items-center gap-2 rounded-lg bg-[#0e3b6a] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0b3158]"
          >
            <Save className="h-4 w-4" />
            Save settings
          </button>
        </div>
      </form>
    </div>
  )
}

