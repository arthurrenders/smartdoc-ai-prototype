-- Refines validation_rules for the three v1 destinations so that documents
-- SmartDoc cannot auto-verify yet (soil certificate, urban planning info, oil
-- tank certificate) become "manual_documents" — surfaced as warnings instead
-- of hard blockers. Prevents sale properties from being un-exportable while
-- still telling the realtor and the destination that those docs need to be
-- added manually.

UPDATE export_destinations
SET validation_rules = jsonb_build_object(
    'required_fields', jsonb_build_array('address', 'asking_price', 'property_type'),
    'required_documents', jsonb_build_array('EPC'),
    'global_required_documents', jsonb_build_array('PHOTO'),
    'conditional', jsonb_build_array(
      jsonb_build_object(
        'if', jsonb_build_object('property.construction_year', jsonb_build_object('lt', 2001)),
        'then', jsonb_build_object('required_documents', jsonb_build_array('ASBESTOS')),
        'reason', 'Bouwjaar < 2001 — asbestattest verplicht'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('property.transaction_type', jsonb_build_object('eq', 'sale')),
        'then', jsonb_build_object(
          'manual_documents', jsonb_build_array('SOIL_CERTIFICATE', 'URBAN_PLANNING_INFO')
        ),
        'reason', 'Verkoop — bodemattest en stedenbouwkundige inlichtingen handmatig toe te voegen'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('property.heating_type', jsonb_build_object('eq', 'oil')),
        'then', jsonb_build_object('manual_documents', jsonb_build_array('OIL_TANK_CERTIFICATE')),
        'reason', 'Stookolie — keuring stookolietank handmatig toe te voegen'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('always', TRUE),
        'then', jsonb_build_object('required_documents', jsonb_build_array('ELECTRICAL')),
        'reason', 'Elektrische keuring vereist voor portaal'
      )
    )
  ),
    updated_at = NOW()
WHERE slug = 'zimmo';

UPDATE export_destinations
SET validation_rules = jsonb_build_object(
    'required_fields', jsonb_build_array('address', 'asking_price', 'property_type', 'living_area_m2'),
    'required_documents', jsonb_build_array('EPC'),
    'global_required_documents', jsonb_build_array('PHOTO'),
    'conditional', jsonb_build_array(
      jsonb_build_object(
        'if', jsonb_build_object('property.construction_year', jsonb_build_object('lt', 2001)),
        'then', jsonb_build_object('required_documents', jsonb_build_array('ASBESTOS')),
        'reason', 'Bouwjaar < 2001 — asbestattest verplicht'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('property.transaction_type', jsonb_build_object('eq', 'sale')),
        'then', jsonb_build_object(
          'manual_documents', jsonb_build_array('SOIL_CERTIFICATE', 'URBAN_PLANNING_INFO')
        ),
        'reason', 'Verkoop — bodemattest en stedenbouwkundige inlichtingen handmatig toe te voegen'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('property.heating_type', jsonb_build_object('eq', 'oil')),
        'then', jsonb_build_object('manual_documents', jsonb_build_array('OIL_TANK_CERTIFICATE')),
        'reason', 'Stookolie — keuring stookolietank handmatig toe te voegen'
      )
    )
  ),
    updated_at = NOW()
WHERE slug = 'immoweb';

UPDATE export_destinations
SET validation_rules = jsonb_build_object(
    'required_fields', jsonb_build_array('address', 'asking_price', 'property_type'),
    'required_documents', jsonb_build_array('EPC'),
    'global_required_documents', jsonb_build_array('PHOTO'),
    'conditional', jsonb_build_array(
      jsonb_build_object(
        'if', jsonb_build_object('property.construction_year', jsonb_build_object('lt', 2001)),
        'then', jsonb_build_object('required_documents', jsonb_build_array('ASBESTOS')),
        'reason', 'Bouwjaar < 2001 — asbestattest verplicht'
      ),
      jsonb_build_object(
        'if', jsonb_build_object('property.transaction_type', jsonb_build_object('eq', 'sale')),
        'then', jsonb_build_object('manual_documents', jsonb_build_array('SOIL_CERTIFICATE')),
        'reason', 'Verkoop — bodemattest handmatig toe te voegen'
      )
    )
  ),
    updated_at = NOW()
WHERE slug = 'realo';
