# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server (localhost:3000)
npm run build      # production build
npm run lint       # ESLint via Next.js
npm run typecheck  # tsc --noEmit (no tests configured)
```

## Environment Variables

**Required:**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
PROPERTIES_OWNER_USER_ID   # Supabase auth.users UUID of the single tenant realtor
DEMO_PROPERTY_ID           # Fallback property UUID used when no property is selected on upload
```

**Optional / feature-gated:**
```
GEMINI_MODEL               # default: gemini-2.5-flash
GEMINI_MODEL_FALLBACK      # empty = disabled
MAPBOX_ACCESS_TOKEN        # satellite map imagery (StreetViewImage)
NOMINATIM_USER_AGENT       # required by Nominatim policy for geocoding to work
OVERPASS_API_URL           # default: public Overpass endpoint
APP_CALENDAR_TIMEZONE      # default: Europe/Brussels
GMAIL_TOKEN_ENCRYPTION_KEY # 32-byte hex — required for Gmail OAuth feature
GOOGLE_OAUTH_CLIENT_ID / CLIENT_SECRET / REDIRECT_URI  # Gmail OAuth
NEXT_PUBLIC_GOOGLE_API_KEY / CLIENT_ID / APP_ID        # Google Drive Picker
DEBUG_NOTIFICATION_SYNC=1               # verbose notification sync logs
DEBUG_NOTIFICATION_SYNC_DOC_ID=<uuid>  # trace a single document_date row
```

## Architecture

### Single-tenant design
This is a single-realtor prototype. One Supabase auth user (`PROPERTIES_OWNER_USER_ID`) owns all data. RLS policies exist on all tables but every server action uses the **service role key** (bypasses RLS). Data isolation is enforced by filtering queries by `user_id` explicitly.

### Supabase clients
- `lib/supabase/server.ts` → `createServerClient()` — service role key, used in all server actions and `lib/` utilities
- `lib/supabase/client.ts` → `createClientClient()` — anon key, used only in client components that need direct Supabase access (rare)

### Data layer: Server Actions only
All data reads and writes go through Next.js Server Actions in `app/actions/`. There are no API routes for data — only `app/api/` contains OAuth callbacks (`/api/auth/gmail/`) and a dev-only PDF debug endpoint. Server actions return discriminated unions: `{ ok: true; ... } | { ok: false; error: string }`.

Supabase PostgREST join results are typed as `unknown[]` and manually cast — there are no generated TypeScript types.

### Document analysis pipeline
Entry point: `lib/analysis/execute-analysis-run.ts` → `executeAnalysisRunPipeline()`.

Flow: PDF download from Supabase Storage → text extraction (`pdfjs-dist` primary, `pdf-parse` fallback) → document type detection via keyword matching → type-specific AI analyzer → persist `red_flags` + `document_dates` + sync `property_addresses`.

Three AI analyzers: `lib/analysis/epc-analyzer.ts`, `electrical-analyzer.ts`, `asbestos-analyzer.ts`. When rule-based confidence < 0.5 or summary is empty, falls back to `lib/analysis/llm-analyzer.ts`. All use Gemini via `lib/ai/gemini.ts`. **Analysis is triggered manually** — no background jobs or cron.

### Bulk intake / auto-matching
`lib/intake/match-or-create-property-from-document.ts` — the core intake logic. Uploads go to `intake_uploads` table, then: Gemini address extraction → Belgian regex heuristic fallback → fuzzy match against `property_addresses` → auto-create property if address is unambiguous and complete → copy PDF to `{propertyId}/intake/{intakeUploadId}_{filename}` in storage → create `documents` + `analysis_runs` rows. Ambiguous or low-confidence matches yield `needs_manual_review` for the realtor to resolve in the intake UI.

### Calendar and appointments
`components/dashboard/DocumentCalendar.tsx` is a fully custom calendar — no external library. Two event kinds:
- **Deadlines** — from `document_dates` (AI-extracted), all-day, urgency-coded red/amber/blue
- **Appointments** — from `appointments` table (manually created), timestamped, blue

`lib/calendar-urgency.ts` provides urgency logic and Tailwind class helpers for both kinds. Appointment times are stored as entered (no timezone conversion) — treat `start_at`/`end_at` as civil time.

### Notification system
`syncNotificationsFromDocumentDates()` in `app/actions/sync-notifications.ts` runs on every dashboard load. It is idempotent: for each `(document_date, notification_rule)` pair inside the reminder window, it upserts a `notifications` row with `ignoreDuplicates: true`. Window = `(deadline − offset_days_before)` through `(deadline + 14 grace days)`. Uses civil calendar date in `Europe/Brussels`, not UTC midnight.

### Gmail email
User connects their Gmail in Settings → OAuth tokens stored AES-encrypted in `realtor_gmail_tokens` (key: `GMAIL_TOKEN_ENCRYPTION_KEY`). `app/actions/send-property-email-gmail.ts` sends RFC822 messages via the Gmail REST API. `app/actions/generate-property-email-draft.ts` uses Gemini to draft compliance emails (missing docs, red flags, mismatch, follow-up) in EN/NL/FR. Success notification uses a custom `window.dispatchEvent(new CustomEvent("smartdoc-gmail-email-sent"))` pattern — no toast library.

### Geocoding / location enrichment
Nominatim (`lib/geocoding/nominatim-be.ts`) geocodes Belgian addresses — **requires `NOMINATIM_USER_AGENT`** or all geocoding calls silently fail. Overpass API (`lib/geocoding/overpass-nearby-transport.ts`) fetches nearby public transport. Results are aggregated and stored in `property_location_enrichment`.

### UI conventions
- **No component library** — only custom Tailwind classes: `.saas-card`, `.saas-btn-primary`, `.saas-btn-secondary`, `.saas-badge`, `.saas-page`, `.dashboard-section-title`
- Brand: `#0e3b6a` (dark), `#519fc8` (light); dashboard palette via CSS variables (`dashboard-primary`, `dashboard-surface`, `dashboard-on-surface`, etc.)
- **Modal pattern**: `fixed inset-0 z-50 flex items-center justify-center bg-black/40` backdrop — see `components/property/RenamePropertyButton.tsx`
- **Toast pattern**: `window.dispatchEvent(new CustomEvent(...))` — see `components/property/GmailSentToast.tsx`
- UI language is Dutch throughout

### Storage paths
Supabase Storage bucket: `documents`
- Direct uploads: `{propertyId}/{filename}`
- Intake-processed: `{propertyId}/intake/{intakeUploadId}_{filename}`
