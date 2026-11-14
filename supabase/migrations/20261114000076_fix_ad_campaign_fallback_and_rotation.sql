-- Migration: 20261114000076_fix_ad_campaign_fallback_and_rotation.sql
-- Description: Fix advertisement campaign selection, rotation fallback, and exclude failed creatives
-- 1. Adds p_exclude_campaign_ids to get_eligible_advertisement to allow client fallback on media error
-- 2. Deprioritizes campaigns with recent playback errors to prevent broken media from starving healthy campaigns
-- 3. Preserves backwards compatibility with existing RPC callers

BEGIN;

SET LOCAL search_path = public, extensions;

-- Drop previous signature cleanly
DROP FUNCTION IF EXISTS public.get_eligible_advertisement(TEXT, UUID);
DROP FUNCTION IF EXISTS public.get_eligible_advertisement(TEXT, UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.get_eligible_advertisement(
  p_session_id TEXT,
  p_last_seen_campaign_id UUID DEFAULT NULL,
  p_exclude_campaign_ids UUID[] DEFAULT '{}'::UUID[]
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
  -- Exclude campaigns that the client has flagged as failing/errored in current session
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
      ) AS recent_impressions,
      (
        SELECT count(*)
        FROM public.ad_events e
        WHERE e.campaign_id = c.id
          AND e.event_type = 'playback_error'
          AND e.created_at >= now() - INTERVAL '24 hours'
      ) AS recent_errors
    FROM public.ad_campaigns c
    JOIN public.ad_creatives cr ON cr.campaign_id = c.id
    WHERE c.status = 'active'
      AND now() >= c.start_at
      AND now() <= c.end_at
      AND (
        p_exclude_campaign_ids IS NULL 
        OR NOT (c.id = ANY(p_exclude_campaign_ids))
      )
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
    -- Penalize broken campaigns with recent errors so they don't starve healthy ones
    CASE WHEN rc.recent_errors > 0 THEN 1 ELSE 0 END ASC,
    CASE
      WHEN v_rotation_strategy = 'priority_weighted' THEN (rc.c_priority::NUMERIC / (rc.recent_impressions + 1)::NUMERIC)
      ELSE 0
    END DESC,
    rc.recent_impressions ASC,
    random()
  LIMIT 1;
END;
$$;

-- Grant execution to all standard client roles
GRANT EXECUTE ON FUNCTION public.get_eligible_advertisement(TEXT, UUID, UUID[]) TO anon, authenticated, service_role;

COMMIT;
