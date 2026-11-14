-- Migration: 20261114000075_advertisement_management_system.sql
-- Description: Complete Advertisement Management System
-- 1. ad_settings: Global configuration & frequency controls
-- 2. ad_campaigns: Campaign scheduling, metadata, skip durations, and statuses
-- 3. ad_creatives: Media storage paths, destination URLs, CTA labels, and file metadata
-- 4. ad_events: Impression, click, skip, and completed view tracking with duplicate protection
-- 5. Storage: Dedicated advertisement-media bucket with admin upload/delete & public read
-- 6. RPCs: get_eligible_advertisement, record_ad_event, get_ad_analytics

BEGIN;

SET LOCAL search_path = public, extensions;

-- ============================================================================
-- 1. ADVERTISEMENT SETTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ad_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  max_ads_per_session INTEGER NOT NULL DEFAULT 1 CHECK (max_ads_per_session >= 1 AND max_ads_per_session <= 10),
  cooldown_minutes INTEGER NOT NULL DEFAULT 15 CHECK (cooldown_minutes >= 0 AND cooldown_minutes <= 1440),
  default_skip_duration INTEGER NOT NULL DEFAULT 5 CHECK (default_skip_duration IN (5, 10, 30)),
  rotation_strategy TEXT NOT NULL DEFAULT 'fair_round_robin' CHECK (rotation_strategy IN ('fair_round_robin', 'priority_weighted')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Seed default settings if not exists
INSERT INTO public.ad_settings (id, is_enabled, max_ads_per_session, cooldown_minutes, default_skip_duration, rotation_strategy)
VALUES ('default', true, 1, 15, 5, 'fair_round_robin')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. AD CAMPAIGNS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name TEXT NOT NULL,
  advertiser_name TEXT NOT NULL,
  description TEXT,
  contact_info TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'expired', 'rejected')),
  skip_duration INTEGER NOT NULL DEFAULT 5 CHECK (skip_duration IN (5, 10, 30)),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  priority INTEGER NOT NULL DEFAULT 1 CHECK (priority >= 1 AND priority <= 10),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ad_campaign_dates CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status_dates ON public.ad_campaigns (status, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_created_at ON public.ad_campaigns (created_at DESC);

-- ============================================================================
-- 3. AD CREATIVES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  storage_path TEXT NOT NULL,
  media_url TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  cta_label TEXT NOT NULL DEFAULT 'Learn More',
  file_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_ad_creative_dest_url CHECK (destination_url ~* '^https://')
);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign_id ON public.ad_creatives (campaign_id);

-- ============================================================================
-- 4. AD EVENTS TABLE (Impressions, Clicks, Skips, Completed Views)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ad_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  creative_id UUID REFERENCES public.ad_creatives(id) ON DELETE SET NULL,
  impression_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click', 'skip', 'completed_view', 'playback_error')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ad_event_impression_type UNIQUE (campaign_id, impression_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_ad_events_campaign_type_created ON public.ad_events (campaign_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_ad_events_created_at ON public.ad_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_events_session ON public.ad_events (session_id);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.ad_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;

-- 5.1 ad_settings RLS
DROP POLICY IF EXISTS "Public can view ad settings" ON public.ad_settings;
CREATE POLICY "Public can view ad settings"
  ON public.ad_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can update ad settings" ON public.ad_settings;
CREATE POLICY "Admins can update ad settings"
  ON public.ad_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5.2 ad_campaigns RLS
DROP POLICY IF EXISTS "Admins have full access to ad campaigns" ON public.ad_campaigns;
CREATE POLICY "Admins have full access to ad campaigns"
  ON public.ad_campaigns FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can view eligible published campaigns" ON public.ad_campaigns;
CREATE POLICY "Public can view eligible published campaigns"
  ON public.ad_campaigns FOR SELECT
  TO anon, authenticated
  USING (
    status = 'active'
    AND now() >= start_at
    AND now() <= end_at
  );

-- 5.3 ad_creatives RLS
DROP POLICY IF EXISTS "Admins have full access to ad creatives" ON public.ad_creatives;
CREATE POLICY "Admins have full access to ad creatives"
  ON public.ad_creatives FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public can view creatives for active campaigns" ON public.ad_creatives;
CREATE POLICY "Public can view creatives for active campaigns"
  ON public.ad_creatives FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ad_campaigns c
      WHERE c.id = ad_creatives.campaign_id
        AND c.status = 'active'
        AND now() >= c.start_at
        AND now() <= c.end_at
    )
  );

-- 5.4 ad_events RLS
DROP POLICY IF EXISTS "Admins can view ad events" ON public.ad_events;
CREATE POLICY "Admins can view ad events"
  ON public.ad_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Public event insertion is handled through the SECURITY DEFINER RPC record_ad_event()
-- For direct insert fallback if needed:
DROP POLICY IF EXISTS "Allow event insertion for active campaigns" ON public.ad_events;
CREATE POLICY "Allow event insertion for active campaigns"
  ON public.ad_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ad_campaigns c
      WHERE c.id = ad_events.campaign_id
        AND c.status = 'active'
    )
  );

-- ============================================================================
-- 6. STORAGE BUCKET & STORAGE POLICIES
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'advertisement-media',
  'advertisement-media',
  TRUE,
  52428800, -- 50MB (supports images and WebM/MP4 videos)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];

-- Storage RLS: Public Read, Admin Write
DROP POLICY IF EXISTS "Public can view advertisement media" ON storage.objects;
CREATE POLICY "Public can view advertisement media"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'advertisement-media');

DROP POLICY IF EXISTS "Admins can upload advertisement media" ON storage.objects;
CREATE POLICY "Admins can upload advertisement media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'advertisement-media'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can update advertisement media" ON storage.objects;
CREATE POLICY "Admins can update advertisement media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'advertisement-media'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can delete advertisement media" ON storage.objects;
CREATE POLICY "Admins can delete advertisement media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'advertisement-media'
    AND public.is_admin()
  );

-- ============================================================================
-- 7. RPC: GET ELIGIBLE ADVERTISEMENT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_eligible_advertisement(
  p_session_id TEXT,
  p_last_seen_campaign_id UUID DEFAULT NULL
)
RETURNS TABLE (
  campaign_id UUID,
  creative_id UUID,
  campaign_name TEXT,
  advertiser_name TEXT,
  description TEXT,
  media_type TEXT,
  media_url TEXT,
  destination_url TEXT,
  cta_label TEXT,
  skip_duration INTEGER,
  priority INTEGER,
  impression_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_enabled BOOLEAN;
  v_rotation_strategy TEXT;
BEGIN
  -- 1. Check global advertisement enable switch
  SELECT is_enabled, rotation_strategy INTO v_is_enabled, v_rotation_strategy
  FROM public.ad_settings
  WHERE id = 'default';

  IF v_is_enabled IS NOT TRUE THEN
    RETURN;
  END IF;

  -- 2. Housekeeping: Update expired active/scheduled campaigns
  UPDATE public.ad_campaigns
  SET status = 'expired', updated_at = now()
  WHERE status IN ('active', 'scheduled')
    AND now() > end_at;

  -- 3. Housekeeping: Transition scheduled campaigns whose start time has arrived
  UPDATE public.ad_campaigns
  SET status = 'active', updated_at = now()
  WHERE status = 'scheduled'
    AND now() >= start_at
    AND now() <= end_at;

  -- 4. Select candidate campaigns
  -- If multiple candidates exist and p_last_seen_campaign_id is provided, prioritize other campaigns
  RETURN QUERY
  WITH candidate_campaigns AS (
    SELECT
      c.id AS c_id,
      c.campaign_name AS c_name,
      c.advertiser_name AS c_adv,
      c.description AS c_desc,
      c.skip_duration AS c_skip,
      c.priority AS c_priority,
      cr.id AS cr_id,
      cr.media_type AS cr_media_type,
      cr.media_url AS cr_media_url,
      cr.destination_url AS cr_dest_url,
      cr.cta_label AS cr_cta,
      (
        SELECT count(*)
        FROM public.ad_events e
        WHERE e.campaign_id = c.id
          AND e.event_type = 'impression'
          AND e.created_at >= now() - INTERVAL '24 hours'
      ) AS recent_impressions
    FROM public.ad_campaigns c
    JOIN public.ad_creatives cr ON cr.campaign_id = c.id
    WHERE c.status = 'active'
      AND now() >= c.start_at
      AND now() <= c.end_at
  ),
  ranked_candidates AS (
    SELECT
      cc.*,
      CASE
        WHEN p_last_seen_campaign_id IS NOT NULL AND cc.c_id = p_last_seen_campaign_id THEN 1
        ELSE 0
      END AS repetition_penalty,
      gen_random_uuid() AS new_impression_id
    FROM candidate_campaigns cc
  )
  SELECT
    rc.c_id,
    rc.cr_id,
    rc.c_name,
    rc.c_adv,
    rc.c_desc,
    rc.cr_media_type,
    rc.cr_media_url,
    rc.cr_dest_url,
    rc.cr_cta,
    rc.c_skip,
    rc.c_priority,
    rc.new_impression_id
  FROM ranked_candidates rc
  ORDER BY
    rc.repetition_penalty ASC,
    CASE
      WHEN v_rotation_strategy = 'priority_weighted' THEN (rc.c_priority::NUMERIC / (rc.recent_impressions + 1)::NUMERIC)
      ELSE 0
    END DESC,
    rc.recent_impressions ASC,
    random()
  LIMIT 1;
END;
$$;

-- ============================================================================
-- 8. RPC: RECORD AD EVENT (Impression, Click, Skip, Completed View)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_ad_event(
  p_campaign_id UUID,
  p_creative_id UUID,
  p_impression_id UUID,
  p_session_id TEXT,
  p_event_type TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Validate campaign exists
  IF NOT EXISTS (
    SELECT 1 FROM public.ad_campaigns
    WHERE id = p_campaign_id
      AND status NOT IN ('draft', 'rejected')
  ) THEN
    RETURN FALSE;
  END IF;

  -- Insert event with duplicate protection via uq_ad_event_impression_type
  INSERT INTO public.ad_events (
    campaign_id,
    creative_id,
    impression_id,
    session_id,
    event_type,
    metadata,
    created_at
  )
  VALUES (
    p_campaign_id,
    p_creative_id,
    p_impression_id,
    p_session_id,
    p_event_type,
    p_metadata,
    now()
  )
  ON CONFLICT (campaign_id, impression_id, event_type) DO NOTHING;

  RETURN FOUND;
END;
$$;

-- ============================================================================
-- 9. RPC: GET AD ANALYTICS (Admin Operations Only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_ad_analytics(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_campaign_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  -- Strict Admin Authorization Check
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied. Administrative privileges required.';
  END IF;

  -- Default to last 30 days if not provided
  v_start := COALESCE(p_start_date, now() - INTERVAL '30 days');
  v_end := COALESCE(p_end_date, now());

  WITH filtered_events AS (
    SELECT *
    FROM public.ad_events
    WHERE created_at >= v_start
      AND created_at <= v_end
      AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
  ),
  overall_metrics AS (
    SELECT
      count(*) FILTER (WHERE event_type = 'impression') AS total_impressions,
      count(DISTINCT impression_id) FILTER (WHERE event_type = 'impression') AS unique_impressions,
      count(*) FILTER (WHERE event_type = 'click') AS total_clicks,
      count(*) FILTER (WHERE event_type = 'skip') AS total_skips,
      count(*) FILTER (WHERE event_type = 'completed_view') AS total_completed_views
    FROM filtered_events
  ),
  campaign_counts AS (
    SELECT
      count(*) FILTER (WHERE status = 'active') AS active_count,
      count(*) FILTER (WHERE status = 'scheduled') AS scheduled_count,
      count(*) FILTER (WHERE status = 'expired') AS expired_count,
      count(*) FILTER (WHERE status = 'paused') AS paused_count,
      count(*) FILTER (WHERE status = 'draft') AS draft_count
    FROM public.ad_campaigns
    WHERE (p_campaign_id IS NULL OR id = p_campaign_id)
  ),
  daily_trends AS (
    SELECT
      to_char(timezone('Asia/Kolkata', created_at), 'YYYY-MM-DD') AS day,
      count(*) FILTER (WHERE event_type = 'impression') AS impressions,
      count(*) FILTER (WHERE event_type = 'click') AS clicks,
      count(*) FILTER (WHERE event_type = 'skip') AS skips,
      count(*) FILTER (WHERE event_type = 'completed_view') AS completed_views
    FROM filtered_events
    GROUP BY 1
    ORDER BY 1 ASC
  ),
  campaign_breakdown AS (
    SELECT
      c.id AS campaign_id,
      c.campaign_name,
      c.advertiser_name,
      c.status,
      c.skip_duration,
      c.start_at,
      c.end_at,
      COALESCE(cr.media_type, 'image') AS media_type,
      count(e.id) FILTER (WHERE e.event_type = 'impression') AS impressions,
      count(DISTINCT e.impression_id) FILTER (WHERE e.event_type = 'impression') AS unique_impressions,
      count(e.id) FILTER (WHERE e.event_type = 'click') AS clicks,
      count(e.id) FILTER (WHERE e.event_type = 'skip') AS skips,
      count(e.id) FILTER (WHERE e.event_type = 'completed_view') AS completed_views
    FROM public.ad_campaigns c
    LEFT JOIN public.ad_creatives cr ON cr.campaign_id = c.id
    LEFT JOIN filtered_events e ON e.campaign_id = c.id
    WHERE (p_campaign_id IS NULL OR c.id = p_campaign_id)
    GROUP BY c.id, c.campaign_name, c.advertiser_name, c.status, c.skip_duration, c.start_at, c.end_at, cr.media_type
    ORDER BY impressions DESC, c.created_at DESC
  )
  SELECT jsonb_build_object(
    'overall', (
      SELECT jsonb_build_object(
        'total_impressions', om.total_impressions,
        'unique_impressions', om.unique_impressions,
        'total_clicks', om.total_clicks,
        'total_skips', om.total_skips,
        'total_completed_views', om.total_completed_views,
        'ctr', CASE WHEN om.total_impressions > 0 THEN round((om.total_clicks::numeric / om.total_impressions::numeric) * 100, 2) ELSE 0 END,
        'completion_rate', CASE WHEN om.total_impressions > 0 THEN round((om.total_completed_views::numeric / om.total_impressions::numeric) * 100, 2) ELSE 0 END,
        'skip_rate', CASE WHEN om.total_impressions > 0 THEN round((om.total_skips::numeric / om.total_impressions::numeric) * 100, 2) ELSE 0 END,
        'active_campaigns', cc.active_count,
        'scheduled_campaigns', cc.scheduled_count,
        'expired_campaigns', cc.expired_count,
        'paused_campaigns', cc.paused_count,
        'draft_campaigns', cc.draft_count
      )
      FROM overall_metrics om, campaign_counts cc
    ),
    'trends', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', dt.day,
          'impressions', dt.impressions,
          'clicks', dt.clicks,
          'skips', dt.skips,
          'completed_views', dt.completed_views,
          'ctr', CASE WHEN dt.impressions > 0 THEN round((dt.clicks::numeric / dt.impressions::numeric) * 100, 2) ELSE 0 END
        )
      )
      FROM daily_trends dt
    ), '[]'::jsonb),
    'campaigns', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'campaign_id', cb.campaign_id,
          'campaign_name', cb.campaign_name,
          'advertiser_name', cb.advertiser_name,
          'status', cb.status,
          'media_type', cb.media_type,
          'skip_duration', cb.skip_duration,
          'start_at', cb.start_at,
          'end_at', cb.end_at,
          'impressions', cb.impressions,
          'unique_impressions', cb.unique_impressions,
          'clicks', cb.clicks,
          'skips', cb.skips,
          'completed_views', cb.completed_views,
          'ctr', CASE WHEN cb.impressions > 0 THEN round((cb.clicks::numeric / cb.impressions::numeric) * 100, 2) ELSE 0 END,
          'completion_rate', CASE WHEN cb.impressions > 0 THEN round((cb.completed_views::numeric / cb.impressions::numeric) * 100, 2) ELSE 0 END
        )
      )
      FROM campaign_breakdown cb
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute permissions on RPCs
GRANT EXECUTE ON FUNCTION public.get_eligible_advertisement(TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_ad_event(UUID, UUID, UUID, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_ad_analytics(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated, service_role;

COMMIT;

