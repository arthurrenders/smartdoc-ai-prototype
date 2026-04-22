"use client"

import { Mail } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { GmailConnectionStatus } from "@/app/actions/gmail-connection"

type GmailSettingsSectionProps = {
  initialStatus: GmailConnectionStatus
}

export function GmailSettingsSection({ initialStatus }: GmailSettingsSectionProps) {
  const searchParams = useSearchParams()
  const gmailParam = searchParams.get("gmail")
  const errorMsg = searchParams.get("msg")

  const connected = initialStatus.ok && initialStatus.connected
  const gmailEmail = connected ? (initialStatus as { connected: true; gmailEmail: string }).gmailEmail : null

  return (
    <section className="saas-card space-y-5">
      <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[#0e3b6a]">
        <Mail className="h-5 w-5 text-[#519fc8]" />
        Gmail Integration
      </h2>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
            aria-hidden
          />
          <span className="text-sm text-foreground">
            {connected ? `Connected as ${gmailEmail}` : "Not connected"}
          </span>
        </div>
        {gmailParam === "connected" && (
          <p className="text-sm font-medium text-emerald-600">Gmail connected successfully.</p>
        )}
        {gmailParam === "error" && (
          <p className="text-sm text-destructive">
            {errorMsg ? decodeURIComponent(errorMsg) : "Gmail connection failed. Please try again."}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Connect Gmail to send email drafts directly from the property page.
        </p>
        <Link
          href="/api/auth/gmail/start"
          className="inline-flex items-center justify-center rounded-lg bg-[#0e3b6a] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0b3158]"
        >
          {connected ? "Reconnect Gmail" : "Connect Gmail"}
        </Link>
      </div>
    </section>
  )
}
