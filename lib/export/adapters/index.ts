import type { Destination, PropertyExportContext } from "../types"
import { buildZimmoPayload, type AdapterPayload } from "./zimmo"
import { buildImmowebPayload } from "./immoweb"
import { buildRealoPayload } from "./realo"

export type { AdapterPayload }

export function buildDestinationPayload(
  destination: Destination,
  ctx: PropertyExportContext,
): AdapterPayload {
  switch (destination.slug) {
    case "zimmo":
      return buildZimmoPayload(destination, ctx)
    case "immoweb":
      return buildImmowebPayload(destination, ctx)
    case "realo":
      return buildRealoPayload(destination, ctx)
    default:
      throw new Error(`Unsupported destination: ${destination.slug}`)
  }
}
