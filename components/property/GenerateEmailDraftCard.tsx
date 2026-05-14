"use client"

import { useEffect, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { Copy, Loader2, Mail, Send } from "lucide-react"
import { generatePropertyEmailDraft } from "@/app/actions/generate-property-email-draft"
import { sendPropertyEmailViaGmail } from "@/app/actions/send-property-email-gmail"
import { GMAIL_SENT_EVENT } from "@/components/property/GmailSentToast"
import type {
  PropertyEmailDraftKind,
  PropertyEmailDraftLanguage,
} from "@/lib/property-email-drafts/types"
import { cn } from "@/lib/utils"

const LANGUAGES: Array<{ id: PropertyEmailDraftLanguage; label: string }> = [
  { id: "en", label: "English" },
  { id: "nl", label: "Dutch" },
  { id: "fr", label: "French" },
]

const EMAIL_KINDS: Array<{
  id: PropertyEmailDraftKind
  label: string
  description: string
  requires: "missing_docs" | "red_flags" | "document_mismatch" | null
}> = [
  {
    id: "missing_docs",
    label: "Ontbrekende documenten",
    description: "Vraag ontbrekende certificaten op.",
    requires: "missing_docs",
  },
  {
    id: "red_flags",
    label: "Nalevingswaarschuwingen",
    description: "Samenvatting van gemarkeerde problemen.",
    requires: "red_flags",
  },
  {
    id: "document_mismatch",
    label: "Mogelijke foutieve upload",
    description: "Vraag het juiste document op.",
    requires: "document_mismatch",
  },
  {
    id: "follow_up",
    label: "Algemene vervolgstap",
    description: "Vriendelijke opvolging op basis van status.",
    requires: null,
  },
]

type GenerateEmailDraftCardProps = {
  propertyId: string
  allowMissingDocs: boolean
  allowRedFlags: boolean
  allowDocumentMismatch: boolean
  gmailConnected?: boolean
  gmailEmail?: string | null
  appLanguage?: PropertyEmailDraftLanguage
}

type EmailDraftAvailability = Pick<
  GenerateEmailDraftCardProps,
  "allowMissingDocs" | "allowRedFlags" | "allowDocumentMismatch"
>

function kindAllowed(kind: PropertyEmailDraftKind, availability: EmailDraftAvailability): boolean {
  switch (kind) {
    case "missing_docs":
      return availability.allowMissingDocs
    case "red_flags":
      return availability.allowRedFlags
    case "document_mismatch":
      return availability.allowDocumentMismatch
    case "follow_up":
      return true
  }
}

export function GenerateEmailDraftCard({
  propertyId,
  allowMissingDocs,
  allowRedFlags,
  allowDocumentMismatch,
  gmailConnected = false,
  gmailEmail = null,
  appLanguage = "nl",
}: GenerateEmailDraftCardProps) {
  const availability = { allowMissingDocs, allowRedFlags, allowDocumentMismatch }
  const defaultKind =
    EMAIL_KINDS.find((k) => k.requires == null || kindAllowed(k.id, availability))?.id ?? "follow_up"

  const [isOpen, setIsOpen] = useState(false)
  const [kind, setKind] = useState<PropertyEmailDraftKind>(defaultKind)
  const [language, setLanguage] = useState<PropertyEmailDraftLanguage>(appLanguage)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [toEmail, setToEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [copyHint, setCopyHint] = useState<string | null>(null)
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [sendError, setSendError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  function open() {
    setIsOpen(true)
    setError(null)
    setCopyHint(null)
    setSendStatus("idle")
    setSendError(null)
    const first =
      EMAIL_KINDS.find((k) => k.requires == null || kindAllowed(k.id, availability))?.id ?? "follow_up"
    setKind(first)
    setSubject("")
    setBody("")
  }

  function generate() {
    setError(null)
    setCopyHint(null)
    setSendStatus("idle")
    setSendError(null)
    if (!kindAllowed(kind, availability)) {
      setError("Dit e-mailtype is niet beschikbaar voor de huidige pandstatus.")
      return
    }
    startTransition(async () => {
      const res = await generatePropertyEmailDraft(propertyId, kind, language)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSubject(res.draft.subject)
      setBody(res.draft.body)
    })
  }

  async function handleSendViaGmail() {
    if (!subject.trim() || !body.trim()) {
      setSendError("Genereer eerst een concept voordat u verzendt.")
      return
    }
    if (!toEmail.trim()) {
      setSendError("Voer een ontvanger e-mailadres in.")
      return
    }
    setSendStatus("sending")
    setSendError(null)
    const res = await sendPropertyEmailViaGmail({
      propertyId,
      to: toEmail.trim(),
      subject: subject.trim(),
      body: body.trim(),
    })
    if (!res.ok) {
      setSendStatus("error")
      setSendError(res.error)
      return
    }
    setSendStatus("sent")
    window.dispatchEvent(new Event(GMAIL_SENT_EVENT))
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopyHint(`${label} copied`)
      setTimeout(() => setCopyHint(null), 2000)
    } catch {
      setCopyHint("Kopiëren mislukt — selecteer de tekst handmatig.")
    }
  }

  return (
    <>
      <section
        className="rounded-xl border border-dashboard-outline-variant/10 bg-white p-5 shadow-sm"
        aria-label="Generate email draft"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dashboard-primary/10 text-dashboard-primary">
              <Mail className="h-4 w-4" aria-hidden />
            </div>
            <div>
              <h2 className="font-headline text-base font-bold text-dashboard-primary">E-mailconcept</h2>
              <p className="text-xs text-dashboard-on-surface-variant">Genereer op basis van analyse</p>
            </div>
          </div>
          <button
            type="button"
            onClick={open}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-dashboard-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-dashboard-primary focus:ring-offset-2"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            Opstellen
          </button>
        </div>
      </section>

      {isOpen && mounted && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-draft-title"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
              <div className="min-w-0">
                <p id="email-draft-title" className="truncate text-sm font-semibold text-foreground">
                  E-mailconcept genereren
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Alleen concept — geen juridisch advies. Controleer voor verzending.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Sluiten"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Type e-mail
                </legend>
                <div className="flex flex-col gap-2">
                  {EMAIL_KINDS.map((opt) => {
                    const allowed = kindAllowed(opt.id, availability)
                    return (
                      <label
                        key={opt.id}
                        className={cn(
                          "flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                          allowed
                            ? "border-[hsl(var(--border))] hover:border-primary/40"
                            : "cursor-not-allowed border-dashed opacity-60"
                        )}
                      >
                        <input
                          type="radio"
                          name="emailKind"
                          value={opt.id}
                          checked={kind === opt.id}
                          disabled={!allowed || isPending}
                          onChange={() => setKind(opt.id)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-medium text-foreground">{opt.label}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{opt.description}</span>
                          {!allowed && opt.requires && (
                            <span className="mt-1 block text-[11px] text-muted-foreground">
                              Niet beschikbaar voor dit pand.
                            </span>
                          )}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Taal
                </legend>
                <div className="flex flex-wrap gap-3">
                  {LANGUAGES.map((opt) => (
                    <label
                      key={opt.id}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm hover:border-primary/40"
                    >
                      <input
                        type="radio"
                        name="emailLanguage"
                        value={opt.id}
                        checked={language === opt.id}
                        disabled={isPending}
                        onChange={() => setLanguage(opt.id)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={generate}
                  disabled={isPending || !kindAllowed(kind, availability)}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm disabled:pointer-events-none disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Genereren…
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4" aria-hidden />
                      Concept genereren
                    </>
                  )}
                </button>
                {copyHint && <span className="text-xs text-muted-foreground">{copyHint}</span>}
              </div>

              {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              {(subject || body) && (
                <div className="space-y-3 border-t pt-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="draft-subject" className="text-xs font-medium text-muted-foreground">
                        Onderwerp
                      </label>
                      <button
                        type="button"
                        onClick={() => copyText("Onderwerp", subject)}
                        disabled={!subject}
                        className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-primary hover:bg-muted disabled:opacity-40"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Kopiëren
                      </button>
                    </div>
                    <input
                      id="draft-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full rounded-md border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="draft-body" className="text-xs font-medium text-muted-foreground">
                        Berichttekst
                      </label>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => copyText("Berichttekst", body)}
                          disabled={!body}
                          className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-primary hover:bg-muted disabled:opacity-40"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                          Kopiëren
                        </button>
                        <button
                          type="button"
                          onClick={() => copyText("Onderwerp + tekst", `Onderwerp: ${subject}\n\n${body}`)}
                          disabled={!subject && !body}
                          className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium text-primary hover:bg-muted disabled:opacity-40"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                          Alles kopiëren
                        </button>
                      </div>
                    </div>
                    <textarea
                      id="draft-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={10}
                      className="w-full resize-y rounded-md border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm leading-relaxed shadow-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  {gmailConnected && (
                    <div className="space-y-2 border-t pt-3">
                      <label htmlFor="draft-to" className="text-xs font-medium text-muted-foreground">
                        Verzenden naar (e-mailadres ontvanger)
                      </label>
                      <input
                        id="draft-to"
                        type="email"
                        value={toEmail}
                        onChange={(e) => setToEmail(e.target.value)}
                        placeholder="recipient@example.com"
                        className="w-full rounded-md border border-[hsl(var(--border))] bg-background px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring"
                        disabled={sendStatus === "sending"}
                      />
                      {gmailEmail && (
                        <p className="text-[11px] text-muted-foreground">Verzenden vanuit: {gmailEmail}</p>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleSendViaGmail()}
                        disabled={sendStatus === "sending" || !toEmail.trim()}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {sendStatus === "sending" ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            Versturen…
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" aria-hidden />
                            Verzenden via Gmail
                          </>
                        )}
                      </button>
                      {sendStatus === "sent" && (
                        <p className="text-sm font-medium text-emerald-600">E-mail succesvol verzonden.</p>
                      )}
                      {(sendStatus === "error") && sendError && (
                        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          {sendError}
                        </div>
                      )}
                    </div>
                  )}

                  {!gmailConnected && (
                    <p className="text-xs text-muted-foreground">
                      Koppel Gmail in{" "}
                      <a href="/settings" className="underline hover:text-foreground">
                        Instellingen
                      </a>{" "}
                      om rechtstreeks te verzenden.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
