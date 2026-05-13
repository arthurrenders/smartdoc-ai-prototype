import type { Metadata } from "next"
import { Suspense } from "react"
import { AlertTriangle, BrainCircuit, CheckCircle2, User } from "lucide-react"
import { createServerClient } from "@/lib/supabase/server"
import { getGmailConnectionStatus } from "@/app/actions/gmail-connection"
import { getDashboardNotifications } from "@/app/actions/get-dashboard-notifications"
import { GmailSettingsSection } from "@/components/settings/GmailSettingsSection"
import { getOwnerUserId } from "@/lib/supabase/ownership"
import { AppShell } from "@/components/AppShell"
import { getTodayLlmUsageSnapshot } from "@/lib/ai/usage-budget"

export const metadata: Metadata = {
  title: "Instellingen",
  description: "Beheer uw account, Gmail-koppeling en applicatieinstellingen.",
}

export const dynamic = "force-dynamic"

type SettingsAccount = {
  name: string
  email: string
}

type AiProviderStatus = {
  geminiConfigured: boolean
  groqConfigured: boolean
  geminiFallbackModel: string | null
  usage: Awaited<ReturnType<typeof getTodayLlmUsageSnapshot>>
}

async function getAccountInfo(): Promise<SettingsAccount> {
  const fallback: SettingsAccount = {
    name: "SmartDoc Gebruiker",
    email: "Niet beschikbaar",
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

async function getAiProviderStatus(): Promise<AiProviderStatus> {
  return {
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    groqConfigured: Boolean(process.env.GROQ_API_KEY?.trim()),
    geminiFallbackModel: process.env.GEMINI_MODEL_FALLBACK?.trim() || null,
    usage: await getTodayLlmUsageSnapshot(),
  }
}

export default async function SettingsPage() {
  const [account, aiStatus, gmailStatus, { data: notificationRows, error: notificationsError }] =
    await Promise.all([
      getAccountInfo(),
      getAiProviderStatus(),
      getGmailConnectionStatus(),
      getDashboardNotifications(12),
    ])

  return (
    <AppShell notifications={notificationRows} notificationsError={notificationsError}>
      <div className="mx-auto max-w-3xl space-y-8 p-8">
        <header className="space-y-2">
          <h1 className="font-headline text-3xl font-bold tracking-tight text-brand-dark sm:text-4xl">
            Instellingen
          </h1>
          <p className="text-sm text-muted-foreground">
            Beheer accountgegevens en werkende SmartDoc-koppelingen.
          </p>
        </header>

        <Suspense
          fallback={<section className="saas-card h-32 animate-pulse rounded-xl bg-muted/30" aria-hidden />}
        >
          <GmailSettingsSection initialStatus={gmailStatus} />
        </Suspense>

        <section className="saas-card space-y-5">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-brand-dark">
            <User className="h-5 w-5 text-brand-light" />
            Accountinformatie
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Gebruikersnaam" value={account.name} />
            <ReadOnlyField label="E-mailadres" value={account.email} />
          </div>
          <p className="text-xs text-muted-foreground">
            Accountvelden worden beheerd via de gekoppelde loginprovider.
          </p>
        </section>

        <section className="saas-card space-y-5">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-brand-dark">
            <BrainCircuit className="h-5 w-5 text-brand-light" />
            AI-analyse
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatusRow
              label="Gemini"
              ok={aiStatus.geminiConfigured}
              text={aiStatus.geminiConfigured ? "Ingesteld" : "Niet ingesteld"}
            />
            <StatusRow
              label="Fallback"
              ok={aiStatus.groqConfigured || Boolean(aiStatus.geminiFallbackModel)}
              text={
                aiStatus.groqConfigured
                  ? "Groq ingesteld"
                  : aiStatus.geminiFallbackModel
                    ? `Gemini fallback: ${aiStatus.geminiFallbackModel}`
                    : "Niet ingesteld"
              }
            />
          </div>
          <div className="rounded-lg border border-[hsl(var(--border))] bg-muted/20 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">Dagelijks AI-verbruik ({aiStatus.usage.day})</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Gemini: {aiStatus.usage.geminiCalls}/{aiStatus.usage.cap} · Groq: {aiStatus.usage.groqCalls}/{aiStatus.usage.cap}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Als Gemini geen bruikbare analyse teruggeeft, probeert SmartDoc automatisch de fallbackprovider voordat een document handmatige review krijgt.
          </p>
        </section>
      </div>
    </AppShell>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        readOnly
        className="w-full rounded-lg border border-[hsl(var(--border))] bg-muted/30 px-3 py-2 text-sm"
      />
    </label>
  )
}

function StatusRow({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-white px-4 py-3">
      <Icon className={`h-5 w-5 ${ok ? "text-emerald-600" : "text-amber-600"}`} aria-hidden />
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
    </div>
  )
}
