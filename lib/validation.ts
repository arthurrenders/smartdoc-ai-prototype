import { z } from "zod"

const emptyToNull = (value: unknown) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const civilDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum is ongeldig.")
const civilTimeSchema = z.string().regex(/^\d{2}:\d{2}$/, "Tijd is ongeldig.")

export const OptionalUuidFromFormSchema = z.preprocess(
  emptyToNull,
  z.string().uuid().nullable()
)

export const OptionalTextFromFormSchema = (max: number) =>
  z.preprocess(emptyToNull, z.string().max(max).nullable())

export const OptionalEmailFromFormSchema = z.preprocess(
  emptyToNull,
  z.string().email("Ongeldig e-mailadres.").max(200).nullable()
)

export const AppointmentFormSchema = z
  .object({
    id: z.preprocess(emptyToNull, z.string().uuid().nullable()).optional(),
    title: z.string().trim().min(1, "Titel is verplicht.").max(120),
    date: civilDateSchema,
    start_time: civilTimeSchema,
    end_time: civilTimeSchema,
    property_id: OptionalUuidFromFormSchema,
    description: OptionalTextFromFormSchema(1000),
    client_name: OptionalTextFromFormSchema(100),
    client_email: OptionalEmailFromFormSchema,
    client_phone: OptionalTextFromFormSchema(30),
    location: OptionalTextFromFormSchema(200),
  })
  .superRefine((value, ctx) => {
    if (`${value.date}T${value.end_time}:00` <= `${value.date}T${value.start_time}:00`) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_time"],
        message: "Eindtijd moet na begintijd zijn.",
      })
    }
  })

export type AppointmentFormInput = z.infer<typeof AppointmentFormSchema>

export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input."
}

export function rejectControlChars(value: string): string {
  return value.replace(/[\r\n\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ").trim()
}
