import type { ConditionalRule, PropertyMetadata } from "../types"

type FieldCheck = { eq?: unknown; lt?: number; lte?: number; gt?: number; gte?: number; in?: unknown[] }

export type RuleEvaluation =
  | { kind: "fired"; reason: string; impliedDocs: string[]; impliedManualDocs: string[] }
  | { kind: "skipped" }
  | {
      kind: "indeterminate"
      reason: string
      impliedDocs: string[]
      impliedManualDocs: string[]
    }

const DUTCH_FIELD_LABELS: Record<string, string> = {
  construction_year: "Bouwjaar",
  transaction_type: "Transactietype",
  heating_type: "Verwarmingstype",
  property_type: "Pandtype",
  asking_price: "Vraagprijs",
  living_area_m2: "Bewoonbare oppervlakte",
}

export function dutchFieldLabel(field: string): string {
  return DUTCH_FIELD_LABELS[field] ?? field
}

function readPath(target: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, target)
}

function checkValue(value: unknown, check: FieldCheck): boolean {
  if (check.eq !== undefined && value !== check.eq) return false
  if (check.lt !== undefined) {
    if (typeof value !== "number" || !(value < check.lt)) return false
  }
  if (check.lte !== undefined) {
    if (typeof value !== "number" || !(value <= check.lte)) return false
  }
  if (check.gt !== undefined) {
    if (typeof value !== "number" || !(value > check.gt)) return false
  }
  if (check.gte !== undefined) {
    if (typeof value !== "number" || !(value >= check.gte)) return false
  }
  if (check.in !== undefined && !check.in.includes(value)) return false
  return true
}

/**
 * Evaluates one conditional rule against the property.
 *
 * Tri-state by design: if the rule depends on a property field that is NULL,
 * we return "indeterminate" so the caller can emit a Warning instead of
 * silently dropping the requirement (graceful degradation per spec).
 */
export function evaluateConditional(
  rule: ConditionalRule,
  property: PropertyMetadata,
): RuleEvaluation {
  const reason = rule.reason ?? ""
  const impliedDocs = rule.then.required_documents ?? []
  const impliedManualDocs = rule.then.manual_documents ?? []

  if ("always" in rule.if && rule.if.always === true) {
    return { kind: "fired", reason, impliedDocs, impliedManualDocs }
  }

  let allMatched = true
  let anyMissing: string | null = null

  for (const [path, check] of Object.entries(rule.if)) {
    if (path === "always") continue
    const cleanPath = path.startsWith("property.") ? path.slice("property.".length) : path
    const value = readPath({ property }, `property.${cleanPath}`)

    if (value === null || value === undefined) {
      anyMissing = cleanPath
      allMatched = false
      break
    }
    if (!checkValue(value, check as FieldCheck)) {
      allMatched = false
      break
    }
  }

  if (allMatched) {
    return { kind: "fired", reason, impliedDocs, impliedManualDocs }
  }
  if (anyMissing) {
    return {
      kind: "indeterminate",
      reason: `${dutchFieldLabel(anyMissing)} onbekend — ${reason || "regel kan niet worden geverifieerd"}`,
      impliedDocs,
      impliedManualDocs,
    }
  }
  return { kind: "skipped" }
}
