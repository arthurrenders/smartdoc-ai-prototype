CREATE INDEX IF NOT EXISTS idx_appointments_user_start_at
  ON appointments(user_id, start_at);

CREATE INDEX IF NOT EXISTS idx_appointments_user_property_start_at
  ON appointments(user_id, property_id, start_at);

ALTER TABLE appointments
  ADD CONSTRAINT appointments_title_length_check
  CHECK (char_length(title) <= 120) NOT VALID;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_client_email_length_check
  CHECK (client_email IS NULL OR char_length(client_email) <= 200) NOT VALID;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_client_phone_length_check
  CHECK (client_phone IS NULL OR char_length(client_phone) <= 30) NOT VALID;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_location_length_check
  CHECK (location IS NULL OR char_length(location) <= 200) NOT VALID;
