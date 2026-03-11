# SmartDoc AI Prototype Plan (MVP)

## Goal
Upload a PDF for a property → store it → run async analysis → show status (Green/Orange/Red) + summary.

## Pages
- /properties/1 : property overview + required document list + upload buttons

## MVP Flow
Upload PDF → save to storage → create documents row → create analysis_run row (queued)
→ background job analyzes (placeholder first) → writes red_flags + status

## Tables
- properties
- document_types
- documents
- analysis_runs
- red_flags


## Dependencies (MVP)

Runtime:
- next
- react
- react-dom

UI:
- tailwindcss
- shadcn/ui
- lucide-react

Backend:
- @supabase/supabase-js
- zod

Document processing:
- pdf-parse (Node-only)

LLM:
- openai (server-only)
