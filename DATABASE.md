# SmartDoc AI — Database Structure

**Provider:** Supabase (PostgreSQL 17.6) — project `smartdocai` (eu-central-1)
**Schema:** `public`
**Tenancy model:** Single-tenant prototype. One Supabase auth user (`PROPERTIES_OWNER_USER_ID`) owns all data. RLS is enabled on every table, but the application uses the service role key from server actions and bypasses RLS — isolation is enforced in application code by filtering on `user_id`.

---

## High-level model

```
auth.users (Supabase Auth)
   │
   ├── properties ───┬── property_addresses          (1:1)
   │                 ├── property_location_enrichment(1:1)
   │                 ├── documents ──┬── analysis_runs
   │                 │               ├── red_flags
   │                 │               └── document_dates ── notifications
   │                 ├── appointments
   │                 ├── property_reports
   │                 └── export_runs ── export_destinations
   │
   ├── intake_uploads (staging area, matched_property_id → properties)
   └── realtor_gmail_tokens (1:1 OAuth credentials)

document_types        (lookup table: epc/electricity/asbestos/…)
notification_rules    (reminder offsets, e.g. 30/14/7 days before)
llm_usage_daily       (cost tracking)
```

---

## Tables

### Core domain

#### `properties`
The central record. One row per listing the realtor manages.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `uuid_generate_v4()` |
| `user_id` | uuid → `auth.users.id` | Owner |
| `display_name` | text UNIQUE | Human-readable label shown in the UI |
| `transaction_type` | text | CHECK: `sale` \| `rent` |
| `property_type` | text | CHECK: `house` \| `apartment` \| `land` \| `commercial` \| `other` |
| `heating_type` | text | CHECK: `gas` \| `oil` \| `electric` \| `heat_pump` \| `district` \| `other` |
| `construction_year` | int | CHECK: 1700–2100 |
| `asking_price`, `bedrooms`, `living_area_m2` | numeric/int | Listing metadata |
| `description` | text | Free-form |
| `metadata_sources` | jsonb | Audit trail of where each field came from |
| `created_at`, `updated_at` | timestamptz | |

#### `property_addresses` (1:1 with properties)
Normalized address + geocoding result.

Key columns: `property_id` (UNIQUE), `raw_line1`, `street`, `house_number`, `box`, `postal_code`, `municipality`, `region`, `country_code` (`BE` default), `latitude`, `longitude`, `geocode_status`, `geocode_error`, `geocoded_at`, `confidence`, `source`.

#### `property_location_enrichment` (1:1 with properties)
PK is `property_id`. Holds Overpass / map enrichment payload in `payload jsonb`, plus `layer`, `status`, `error_message`, `enriched_at`.

#### `documents`
Each uploaded PDF (EPC, electrical inspection, asbestos attest, etc.).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `property_id` | uuid → properties.id | |
| `document_type_id` | uuid → document_types.id | Nullable until detected |
| `storage_path` | text | Path inside `documents` Supabase Storage bucket |
| `status` | text | `pending` default |
| `is_active` | bool | Soft-delete / supersede flag |
| `expected_property_id` | uuid → properties.id | Set on intake when the realtor pre-selected a property |
| `expected_address`, `extracted_document_address` | text | For mismatch detection |
| `address_match_status` | text | CHECK: `match` \| `possible_match` \| `mismatch` \| `unknown` |
| `address_match_confidence` | float | |
| `address_match_reason` | text | LLM/heuristic explanation |
| `address_match_user_overridden` | bool | Realtor manually accepted/rejected |

#### `document_types` (lookup)
Static list — `id`, `name UNIQUE` (epc / electricity / asbestos / energie / brand-elektriciteit / loodgieter / …).

#### `analysis_runs`
One row per analysis attempt on a document. Status machine: `queued → processing → done` / `error`.

Columns: `id`, `document_id`, `status`, `model_name`, `prompt_version`, `result_json` (full Gemini output), `created_at`, `updated_at`.

#### `red_flags`
Per-document compliance issues extracted by the analyzers.

`id`, `document_id`, `severity` (CHECK: `red` / `orange` / `green`), `title`, `details`.

#### `document_dates`
AI-extracted deadlines (EPC validity, electrical conformity expiry, asbestos report date, etc.). Drives the dashboard calendar + notification windows.

Columns: `id`, `document_id`, `property_id`, `analysis_run_id`, `date_type`, `date_on` (date), `label`, `source`, `source_text`, `confidence`, `is_critical`, `metadata jsonb`, `created_at`, `updated_at`.

Uniqueness: `UNIQUE (document_id, date_type, date_on)` — prevents duplicate extractions.

### Notifications

#### `notification_rules`
Configurable reminder offsets (e.g. "30 days before", "14 days before"). Currently empty (0 rows) — relies on defaults baked into `sync-notifications.ts`.

`id`, `offset_days_before` (UNIQUE, 1–365), `label`, `date_types text[]`, `enabled`, `sort_order`.

#### `notifications`
Materialized reminders for the realtor. Generated idempotently on every dashboard load via `syncNotificationsFromDocumentDates()`.

`id`, `user_id`, `property_id`, `document_id`, `document_date_id`, `rule_id`, `title`, `body`, `read_at` (null = unread), `created_at`.
Uniqueness: `UNIQUE (document_date_id, rule_id)` — keeps sync idempotent.

### Intake / bulk upload

#### `intake_uploads`
Staging table for the auto-match-or-create-property pipeline. Each uploaded PDF lands here first, then is processed (address extraction → fuzzy match → property creation or attach).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid → auth.users.id | |
| `filename`, `storage_path`, `mime_type`, `original_file_size` | | |
| `source_relative_path` | text | Original `webkitRelativePath` from folder uploads |
| `detected_document_type` | enum `document_type` | `epc` / `electricity` / `asbestos` / `unknown` |
| `extracted_address_raw` | text | What Gemini / regex pulled out |
| `matched_property_id` | uuid → properties.id | Existing property the file was attached to |
| `created_property_id` | uuid → properties.id | Property auto-created from this upload |
| `confidence_score` | numeric | Match confidence |
| `processing_status` | enum `intake_status` | `uploaded` / `processing` / `processed` / `failed` / `needs_review` |
| `needs_manual_review` | bool | Drives the intake review queue UI |
| `error_message` | text | |

### Calendar

#### `appointments`
Manually created calendar entries (viewings, meetings). Stored as civil time — no timezone conversion.

`id`, `user_id`, `property_id` (nullable), `title` (≤120 chars), `description`, `start_at`, `end_at`, `client_name`, `client_email` (≤200), `client_phone` (≤30), `location` (≤200).

### Gmail integration

#### `realtor_gmail_tokens`
**See "What is `realtor_gmail_tokens`?" below.**

PK = `user_id` (1:1 per realtor). Stores AES-encrypted OAuth tokens for sending mail through the realtor's own Gmail.

`user_id`, `gmail_email`, `access_token_enc`, `refresh_token_enc`, `access_token_expires_at`, `scope`, `created_at`, `updated_at`.

### Reports & exports

#### `property_reports`
Free-form notes/reports attached to a property. `id`, `property_id`, `title`, `note_text`, `author_name`.

#### `export_destinations` (lookup, 3 rows)
Configured external systems the dossier can be exported to.
`id`, `name`, `slug UNIQUE`, `type` (CHECK: `portal` / `crm` / `legal`), `output_format` (CHECK: `json` / `csv` / `xml` / `full_bundle`), `validation_rules jsonb`, `field_mapping jsonb`, `enabled`.

#### `export_runs`
History of export jobs. `id`, `property_id`, `destination_id`, `status` (`queued` / `generating` / `done` / `error`), `readiness_score`, `missing_items jsonb`, `storage_path`, `error_message`, `created_by`, `completed_at`.

### Observability

#### `llm_usage_daily`
Daily Gemini / Groq call counters. PK = `day` (date). Columns: `gemini_calls`, `groq_calls`, `updated_at`. Used for cost tracking.

---

## Enums

- **`document_type`**: `epc` · `electricity` · `asbestos` · `unknown`
- **`intake_status`**: `uploaded` · `processing` · `processed` · `failed` · `needs_review`

---

## Indexes

Covers all primary keys + most foreign keys. Notable composites:

- `documents (property_id, document_type_id, is_active, created_at DESC)` — drives the "latest document per type per property" lookups
- `document_dates (property_id, date_on)` — calendar queries
- `appointments (user_id, start_at)` and `(user_id, property_id, start_at)` — calendar queries
- `export_runs (property_id, created_at DESC)` and `(destination_id, created_at DESC)`
- `intake_uploads (user_id, created_at DESC)` and `(user_id, needs_manual_review)`

---

## What is `realtor_gmail_tokens`?

It stores the encrypted Google OAuth credentials the realtor grants when they connect their Gmail account in **Settings → "Connect Gmail"**.

**Why it exists:** SmartDoc sends compliance emails (missing-document requests, red-flag warnings, address-mismatch notices, follow-ups) on the realtor's behalf — but those mails need to come **from the realtor's own Gmail address**, not from a generic `noreply@smartdoc`. That gives the recipient a familiar sender, keeps the reply thread in the realtor's inbox, and avoids spam filters. To do that without storing the realtor's password, we use Google OAuth: the realtor approves the app once, Google hands back `access_token` + `refresh_token`, and we store them in this table.

**What's in each row** (one row per realtor, PK is `user_id`):

| Column | Purpose |
|---|---|
| `user_id` | FK to `auth.users` — owner |
| `gmail_email` | Which Gmail address the tokens belong to (shown in the UI: "Connected as `arthur@…`") |
| `access_token_enc` | AES-encrypted short-lived access token (~1 hour) |
| `refresh_token_enc` | AES-encrypted long-lived refresh token — used to mint new access tokens |
| `access_token_expires_at` | When to refresh |
| `scope` | What permissions were granted (e.g. `gmail.send`) |

Tokens are encrypted with `GMAIL_TOKEN_ENCRYPTION_KEY` (a 32-byte hex env var) before insert. The app code: `app/api/auth/gmail/` (OAuth callback), `app/actions/send-property-email-gmail.ts` (send), `app/actions/generate-property-email-draft.ts` (Gemini draft).

**Without this table the Gmail feature simply won't work** — but the rest of the app is unaffected because all other email/notification paths are independent.

---

## Health check — what's correct and what could be improved

I ran Supabase's security + performance advisors. Result: **no schema bugs, no broken constraints, nothing breaking the app.** All advisories are best-practice nudges and the app continues to work as-is.

### ✅ What's healthy

- All FKs reference valid parents, ON DELETE behavior is consistent.
- CHECK constraints on enums-as-text (`severity`, `status`, `transaction_type`, …) are in place.
- Idempotency guard rails: `UNIQUE (document_id, date_type, date_on)` on `document_dates`, `UNIQUE (document_date_id, rule_id)` on `notifications`, `UNIQUE (property_id)` on `property_addresses`.
- Composite indexes match the actual query patterns in `app/actions/`.
- Postgres version 17 is current.

### ✅ Fixes applied (migration `drop_duplicate_and_add_fk_indexes`, 2026-05-14)

1. **Duplicate index on `intake_uploads`** — `idx_intake_status` dropped (was identical to `idx_intake_uploads_processing_status`).
2. **Unindexed foreign keys (7)** — added covering indexes on:
   - `document_dates.analysis_run_id`
   - `documents.expected_property_id`
   - `export_runs.created_by`
   - `intake_uploads.created_property_id`
   - `notifications.document_id`, `notifications.property_id`, `notifications.rule_id`

### ⚠️ Remaining (low-priority, no functional impact)

3. **RLS policies use `auth.uid()` directly (~35 policies)** — Supabase recommends wrapping in `(select auth.uid())` so PostgreSQL evaluates it once per query instead of once per row. **Note:** because your server actions use the service-role key (which bypasses RLS), this has zero real-world impact today. Only relevant if you ever migrate to using the anon key + RLS for client-side access.

4. **RLS enabled but no policies** on `document_dates`, `llm_usage_daily`, `realtor_gmail_tokens` — same story: only accessed via service role, so no policies are needed. You could either add explicit deny-all policies for the anon role (defense in depth) or accept this as intentional.

5. **Unused indexes (12)** — flagged because the database has very low traffic (single tenant, ~2 properties). Don't drop these; they'll start being used when real data lands. Re-run the advisor in 3–6 months once the app has real usage.

6. **Leaked-password protection is disabled** in Supabase Auth settings. Toggle on in the Supabase dashboard → Auth → Policies to block compromised passwords against HaveIBeenPwned.

7. **Empty table `notification_rules`** — the column shape exists but no rows. Reminder offsets are currently hardcoded in `app/actions/sync-notifications.ts`. Either seed the table (so offsets become configurable) or drop it if you've decided to keep the logic in code.

8. **`document_types` lookup** could be a Postgres enum like `document_type` already is in `intake_uploads`. Two parallel representations of the same concept exist — minor inconsistency, not urgent.

### Nothing requires a fix to keep the app working

Every advisory above is a "nice to have." The schema is consistent, the constraints are right, and the indexes cover the real query paths. The app will continue to function exactly as it does now if you change nothing.
