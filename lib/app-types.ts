export type PropertyOption = {
  id: string
  display_name: string | null
}

export type ClientContact = {
  name: string | null
  email: string | null
  phone: string | null
}

export type AppointmentEntry = {
  id: string
  property_id: string | null
  title: string
  description: string | null
  start_at: string
  end_at: string
  client_name: string | null
  client_email: string | null
  client_phone: string | null
  location: string | null
  propertyDisplayName: string | null
  propertyAddress: string | null
}
