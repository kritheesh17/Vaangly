-- Migration: 20261002000053_postgis_spatial_foundation.sql
-- Description: Phase 2 PostGIS Spatial Location Foundation.
-- Enables PostGIS, adds nullable geom_location column to shops,
-- backfills existing valid coordinates, creates GiST spatial index,
-- and establishes an automatic synchronization trigger.

BEGIN;

-- 1. Enable PostGIS extension in the extensions schema
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- Ensure search_path includes extensions for this transaction
SET LOCAL search_path = public, extensions;

-- 2. Add spatial column geom_location to shops table
-- Preserves existing gps_lat, gps_lng, address_line, and location_id
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS geom_location extensions.geography(Point, 4326);

-- 3. Backfill existing shops with valid coordinates
-- IMPORTANT: Longitude is X (first parameter), Latitude is Y (second parameter)
UPDATE public.shops
SET geom_location = extensions.ST_SetSRID(extensions.ST_MakePoint(gps_lng, gps_lat), 4326)::extensions.geography
WHERE gps_lat IS NOT NULL
  AND gps_lng IS NOT NULL
  AND gps_lat BETWEEN -90 AND 90
  AND gps_lng BETWEEN -180 AND 180;

-- 4. Create GiST spatial index for high-speed distance and radius queries
CREATE INDEX IF NOT EXISTS idx_shops_geom_location_gist
  ON public.shops USING GIST (geom_location);

-- 5. Trigger function to automatically synchronize geom_location from gps_lat / gps_lng
CREATE OR REPLACE FUNCTION public.sync_shop_geom_location()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When valid coordinates are provided, generate the PostGIS geography Point
  -- Longitude is X (first arg), Latitude is Y (second arg)
  IF NEW.gps_lat IS NOT NULL
     AND NEW.gps_lng IS NOT NULL
     AND NEW.gps_lat BETWEEN -90 AND 90
     AND NEW.gps_lng BETWEEN -180 AND 180 THEN
    NEW.geom_location := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.gps_lng, NEW.gps_lat), 4326)::extensions.geography;
  ELSE
    NEW.geom_location := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Attach trigger to public.shops (fires on INSERT or when coordinates change)
DROP TRIGGER IF EXISTS trg_sync_shop_geom_location ON public.shops;
CREATE TRIGGER trg_sync_shop_geom_location
  BEFORE INSERT OR UPDATE OF gps_lat, gps_lng ON public.shops
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_shop_geom_location();

COMMIT;

