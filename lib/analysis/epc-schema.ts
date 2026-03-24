import { z } from "zod"

// Schema for EPC-specific AI response
export const EPCResponseSchema = z.object({
  document_type: z.literal("epc").optional(),
  epc_score_letter: z.enum(["A+", "A", "B", "C", "D", "E", "F"]).nullable(),
  energy_consumption_kwh_m2_year: z.number().nullable(),
  certificate_date: z.string().nullable(),
  expiry_date: z.string().nullable(),
  is_expired: z.boolean().nullable(),
  red_flags: z.array(z.string()).optional().default([]),
  property_street: z.string().nullable().optional(),
  property_house_number: z.string().nullable().optional(),
  property_box: z.string().nullable().optional(),
  property_postal_code: z.string().nullable().optional(),
  property_municipality: z.string().nullable().optional(),
  property_region: z.string().nullable().optional(),
})

export type EPCResponse = z.infer<typeof EPCResponseSchema>



