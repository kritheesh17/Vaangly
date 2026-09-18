-- Staging location configuration: keep historical locations, expose Kangeyam only.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.locations
    WHERE lower(name) = 'kangeyam'
      AND lower(state) = 'tamil nadu'
  ) THEN
    INSERT INTO public.locations (
      id,
      name,
      state,
      pincode,
      is_active,
      is_launch_town
    )
    VALUES (
      '10000000-0000-0000-0000-000000000004',
      'Kangeyam',
      'Tamil Nadu',
      '638108',
      TRUE,
      TRUE
    );
  END IF;
END $$;

WITH kangeyam AS (
  SELECT id
  FROM public.locations
  WHERE lower(name) = 'kangeyam'
    AND lower(state) = 'tamil nadu'
  ORDER BY id
  LIMIT 1
)
UPDATE public.locations AS locations
SET
  name = 'Kangeyam',
  state = 'Tamil Nadu',
  pincode = '638108',
  is_active = TRUE,
  is_launch_town = TRUE
FROM kangeyam
WHERE locations.id = kangeyam.id;

UPDATE public.locations
SET is_active = FALSE
WHERE id <> (
  SELECT id
  FROM public.locations
  WHERE lower(name) = 'kangeyam'
    AND lower(state) = 'tamil nadu'
  ORDER BY id
  LIMIT 1
);

COMMIT;