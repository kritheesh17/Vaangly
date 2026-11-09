-- Migration: 20261109000074_fix_nearby_shops_upi_qr_and_request_trigger.sql
-- Description: Fix UPI QR detection in checkout and customer order creation:
-- 1. Updates require_request_shop_upi_qr() so that UPI order requests only require
--    the shop to have a valid upi_qr_url configured (upi_id is optional).
-- 2. Updates get_nearby_shops() to return upi_qr_url in the returns table and select list,
--    ensuring storefront location searches provide shop UPI QR configuration.

BEGIN;

SET LOCAL search_path = public, extensions;

-- 1. Correct request trigger to check upi_qr_url without mandating upi_id
CREATE OR REPLACE FUNCTION public.require_request_shop_upi_qr()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF lower(COALESCE(NEW.payment_method, '')) = 'upi'
     AND NOT EXISTS (
       SELECT 1
       FROM public.shops
       WHERE id = NEW.shop_id
         AND NULLIF(trim(COALESCE(upi_qr_url, '')), '') IS NOT NULL
         AND lower(upi_qr_url) NOT LIKE '%your-project-id%'
         AND upi_qr_url ~* '^(https?://|data:image/)'
     ) THEN
    RAISE EXCEPTION 'UPI payment is unavailable because this shop has not configured its UPI QR code';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_request_shop_upi_qr ON public.requests;
CREATE TRIGGER trg_require_request_shop_upi_qr
  BEFORE INSERT OR UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.require_request_shop_upi_qr();

-- 2. Include upi_qr_url in get_nearby_shops() RPC
DROP FUNCTION IF EXISTS public.get_nearby_shops(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER);

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
  upi_qr_url TEXT,
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
    RETURN;
  END IF;

  -- 2. Radius and Limit Validation / Clamping
  IF p_radius_meters IS NULL OR p_radius_meters <= 0 THEN
    RETURN;
  END IF;
  
  v_clamped_radius := LEAST(p_radius_meters, 50000.0);
  v_clamped_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));

  -- 3. Construct Customer Geography Point (Longitude = X, Latitude = Y)
  v_customer_point := extensions.ST_SetSRID(
    extensions.ST_MakePoint(p_customer_lng, p_customer_lat),
    4326
  )::extensions.geography;

  -- 4. Query live active shops within radius using GiST spatial index & ST_DWithin
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
    s.upi_qr_url::TEXT,
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
  WHERE
    s.status = 'active'
    AND s.is_live = TRUE
    AND s.geom_location IS NOT NULL
    AND extensions.ST_DWithin(s.geom_location, v_customer_point, v_clamped_radius)
  ORDER BY
    extensions.ST_Distance(s.geom_location, v_customer_point) ASC,
    s.created_at DESC
  LIMIT v_clamped_limit
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_nearby_shops(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INTEGER, INTEGER) TO anon, authenticated, service_role;

COMMIT;
