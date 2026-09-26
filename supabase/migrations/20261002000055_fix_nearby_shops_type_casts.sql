-- Migration: 20261002000055_fix_nearby_shops_type_casts.sql
-- Description: Corrective fix for public.get_nearby_shops() PL/pgSQL function.
-- Resolves PostgreSQL error 42804 by explicitly casting VARCHAR and TIME columns to TEXT
-- to match the RETURNS TABLE signature, without modifying historical migrations.

BEGIN;

SET LOCAL search_path = public, extensions;

CREATE OR REPLACE FUNCTION public.get_nearby_shops(
  p_customer_lat DOUBLE PRECISION,
  p_customer_lng DOUBLE PRECISION,
  p_radius_meters DOUBLE PRECISION DEFAULT 5000,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  owner_id UUID,
  shop_type_id UUID,
  location_id UUID,
  name TEXT,
  tagline TEXT,
  address_line TEXT,
  phone TEXT,
  status TEXT,
  is_live BOOLEAN,
  delivery_available BOOLEAN,
  delivery_fee NUMERIC,
  upi_id TEXT,
  gps_lat NUMERIC,
  gps_lng NUMERIC,
  photo_url TEXT,
  opening_time TEXT,
  closing_time TEXT,
  is_open_today BOOLEAN,
  distance_meters DOUBLE PRECISION,
  avg_rating NUMERIC,
  total_ratings BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_customer_point extensions.geography;
  v_clamped_limit INTEGER;
  v_clamped_radius DOUBLE PRECISION;
BEGIN
  -- 1. Coordinate Range Validation
  IF p_customer_lat IS NULL OR p_customer_lng IS NULL OR
     p_customer_lat < -90.0 OR p_customer_lat > 90.0 OR
     p_customer_lng < -180.0 OR p_customer_lng > 180.0 THEN
    RETURN; -- Return empty set safely without crashing
  END IF;

  -- 2. Radius and Limit Validation / Clamping
  IF p_radius_meters IS NULL OR p_radius_meters <= 0 THEN
    RETURN;
  END IF;
  
  -- Prevent excessive query load: max radius 50,000 meters (50km)
  v_clamped_radius := LEAST(p_radius_meters, 50000.0);
  
  -- Clamp limit between 1 and 100
  v_clamped_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));

  -- 3. Construct Customer Geography Point (Longitude = X, Latitude = Y)
  -- Transient point only: Never stored in database
  v_customer_point := extensions.ST_SetSRID(
    extensions.ST_MakePoint(p_customer_lng, p_customer_lat),
    4326
  )::extensions.geography;

  -- 4. Query live active shops within radius using GiST spatial index & ST_DWithin
  -- Explicitly cast VARCHAR and TIME columns to TEXT to avoid PL/pgSQL 42804 type mismatch
  RETURN QUERY
  SELECT
    s.id,
    s.owner_id,
    s.shop_type_id,
    s.location_id,
    s.name::TEXT,
    s.tagline::TEXT,
    s.address_line::TEXT,
    s.phone::TEXT,
    s.status::TEXT,
    s.is_live,
    s.delivery_available,
    s.delivery_fee,
    s.upi_id::TEXT,
    s.gps_lat,
    s.gps_lng,
    s.photo_url::TEXT,
    s.opening_time::TEXT,
    s.closing_time::TEXT,
    s.is_open_today,
    ROUND(extensions.ST_Distance(s.geom_location, v_customer_point)::numeric, 1)::DOUBLE PRECISION AS distance_meters,
    r.avg_rating,
    COALESCE(r.total_ratings, 0)::BIGINT AS total_ratings
  FROM public.shops s
  LEFT JOIN public.shop_avg_ratings r ON r.shop_id = s.id
  WHERE s.status = 'active'
    AND s.is_live = true
    AND s.geom_location IS NOT NULL
    AND extensions.ST_DWithin(s.geom_location, v_customer_point, v_clamped_radius)
  ORDER BY distance_meters ASC
  LIMIT v_clamped_limit
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

-- Grant execution privileges to all application roles
GRANT EXECUTE ON FUNCTION public.get_nearby_shops(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER) TO anon, authenticated, service_role;

COMMIT;
