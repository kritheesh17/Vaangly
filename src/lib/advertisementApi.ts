import { supabase, isSupabaseConfigured } from './supabase';
import {
  AdCampaign,
  AdSettings,
  AdAnalyticsData,
  AdEligibleCampaign,
  AdEventType,
  CreateCampaignPayload,
  UpdateCampaignPayload,
} from '../types/advertisement';

export const AD_STORAGE_BUCKET = 'advertisement-media';

// Maximum file size limits
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];

/**
 * Validates external destination URLs
 * Must be secure HTTPS URLs to prevent JavaScript injection and insecure schemes.
 */
export function validateDestinationUrl(url: string): { valid: boolean; error?: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'Destination URL is required.' };
  }
  const trimmed = url.trim();
  if (!trimmed.toLowerCase().startsWith('https://')) {
    return { valid: false, error: 'Destination URL must begin with https:// for security.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS protocol is permitted.' };
    }
    if (!parsed.hostname || parsed.hostname.length < 3) {
      return { valid: false, error: 'A valid domain hostname is required.' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Please enter a valid, complete web URL.' };
  }
}

/**
 * Validates media file prior to upload
 */
export function validateMediaFile(
  file: File,
  expectedType: 'image' | 'video'
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'Please select a media file to upload.' };
  }

  if (expectedType === 'image') {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
      return { valid: false, error: 'Invalid image format. Supported formats: JPEG, PNG, WebP.' };
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return { valid: false, error: 'Image exceeds the maximum allowed size of 10MB.' };
    }
  } else if (expectedType === 'video') {
    if (!ALLOWED_VIDEO_TYPES.includes(file.type.toLowerCase())) {
      return { valid: false, error: 'Invalid video format. Supported formats: MP4, WebM.' };
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      return { valid: false, error: 'Video exceeds the maximum allowed size of 50MB.' };
    }
  }

  return { valid: true };
}

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

/**
 * Fetch all advertisement campaigns with their creatives and computed stats
 */
export async function fetchAdminCampaigns(): Promise<AdCampaign[]> {
  if (!isSupabaseConfigured) return [];

  // Fetch campaigns with linked creatives
  const { data: campaigns, error } = await supabase
    .from('ad_campaigns')
    .select('*, creatives:ad_creatives(*)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching ad campaigns:', error.message);
    throw new Error(error.message);
  }

  if (!campaigns || campaigns.length === 0) return [];

  // Fetch campaign aggregate metrics from ad_events for fast display
  const { data: eventCounts, error: evErr } = await supabase
    .from('ad_events')
    .select('campaign_id, event_type');

  const statsMap: Record<string, { impressions: number; clicks: number }> = {};
  if (!evErr && eventCounts) {
    for (const ev of eventCounts) {
      if (!statsMap[ev.campaign_id]) {
        statsMap[ev.campaign_id] = { impressions: 0, clicks: 0 };
      }
      if (ev.event_type === 'impression') {
        statsMap[ev.campaign_id].impressions++;
      } else if (ev.event_type === 'click') {
        statsMap[ev.campaign_id].clicks++;
      }
    }
  }

  // Auto-evaluate expired and scheduled status transitions on display
  const now = new Date();
  return campaigns.map((c) => {
    const stats = statsMap[c.id] || { impressions: 0, clicks: 0 };
    const ctr = stats.impressions > 0 ? Number(((stats.clicks / stats.impressions) * 100).toFixed(2)) : 0;
    
    // Check if status should display as expired
    let computedStatus = c.status;
    const endDate = new Date(c.end_at);
    const startDate = new Date(c.start_at);
    if ((c.status === 'active' || c.status === 'scheduled') && now > endDate) {
      computedStatus = 'expired';
    } else if (c.status === 'scheduled' && now >= startDate && now <= endDate) {
      computedStatus = 'active';
    }

    return {
      ...c,
      status: computedStatus,
      impressions: stats.impressions,
      clicks: stats.clicks,
      ctr,
    };
  });
}

/**
 * Fetch single campaign by ID
 */
export async function fetchAdminCampaignById(id: string): Promise<AdCampaign | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabase
    .from('ad_campaigns')
    .select('*, creatives:ad_creatives(*)')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching campaign by id:', error.message);
    return null;
  }
  return data;
}

/**
 * Create a new advertisement campaign and upload its creative media
 */
export async function createAdminCampaign(
  payload: CreateCampaignPayload,
  mediaFile: File
): Promise<AdCampaign> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase client is not configured.');
  }

  // 1. Validation
  const urlValidation = validateDestinationUrl(payload.destination_url);
  if (!urlValidation.valid) {
    throw new Error(urlValidation.error);
  }

  const mediaValidation = validateMediaFile(mediaFile, payload.media_type);
  if (!mediaValidation.valid) {
    throw new Error(mediaValidation.error);
  }

  const startDate = new Date(payload.start_at);
  const endDate = new Date(payload.end_at);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('Invalid campaign start or end date.');
  }
  if (endDate <= startDate) {
    throw new Error('Campaign end date must be strictly after the start date.');
  }

  // 2. Upload media to dedicated Supabase Storage bucket
  const fileExt = mediaFile.name.split('.').pop()?.toLowerCase() || (payload.media_type === 'video' ? 'mp4' : 'jpg');
  const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 12);
  const storagePath = `campaigns/${uniqueId}/${Date.now()}.${fileExt}`;

  const { error: uploadErr } = await supabase.storage
    .from(AD_STORAGE_BUCKET)
    .upload(storagePath, mediaFile, {
      contentType: mediaFile.type,
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadErr) {
    console.error('Storage upload error:', uploadErr.message);
    throw new Error(`Failed to upload media file: ${uploadErr.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(AD_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  const mediaUrl = publicUrlData.publicUrl;

  // 3. Determine initial status if not explicitly provided
  let initialStatus = payload.status || 'draft';
  const now = new Date();
  if (initialStatus === 'active' && startDate > now) {
    initialStatus = 'scheduled';
  } else if (initialStatus === 'active' && now > endDate) {
    initialStatus = 'expired';
  }

  // 4. Insert Campaign
  const { data: campaign, error: campErr } = await supabase
    .from('ad_campaigns')
    .insert({
      campaign_name: payload.campaign_name.trim(),
      advertiser_name: payload.advertiser_name.trim(),
      description: payload.description?.trim() || null,
      contact_info: payload.contact_info?.trim() || null,
      status: initialStatus,
      skip_duration: payload.skip_duration,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      timezone: 'Asia/Kolkata',
      priority: payload.priority || 1,
    })
    .select()
    .single();

  if (campErr) {
    // Cleanup uploaded storage file if DB insert fails
    await supabase.storage.from(AD_STORAGE_BUCKET).remove([storagePath]);
    throw new Error(`Failed to create campaign: ${campErr.message}`);
  }

  // 5. Insert Creative
  const { data: creative, error: creatErr } = await supabase
    .from('ad_creatives')
    .insert({
      campaign_id: campaign.id,
      media_type: payload.media_type,
      storage_path: storagePath,
      media_url: mediaUrl,
      destination_url: payload.destination_url.trim(),
      cta_label: payload.cta_label.trim() || 'Learn More',
      file_metadata: {
        file_name: mediaFile.name,
        file_size: mediaFile.size,
        mime_type: mediaFile.type,
      },
    })
    .select()
    .single();

  if (creatErr) {
    // Rollback campaign & storage
    await supabase.from('ad_campaigns').delete().eq('id', campaign.id);
    await supabase.storage.from(AD_STORAGE_BUCKET).remove([storagePath]);
    throw new Error(`Failed to save advertisement creative: ${creatErr.message}`);
  }

  return {
    ...campaign,
    creatives: [creative],
    impressions: 0,
    clicks: 0,
    ctr: 0,
  };
}

/**
 * Update an existing campaign and optionally replace its creative media
 */
export async function updateAdminCampaign(
  id: string,
  payload: UpdateCampaignPayload,
  newMediaFile?: File
): Promise<AdCampaign> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase client is not configured.');
  }

  // Fetch current campaign & creative
  const current = await fetchAdminCampaignById(id);
  if (!current) throw new Error('Campaign not found.');
  const currentCreative = current.creatives?.[0];

  // 1. URL validation if provided
  if (payload.destination_url) {
    const urlValidation = validateDestinationUrl(payload.destination_url);
    if (!urlValidation.valid) {
      throw new Error(urlValidation.error);
    }
  }

  // 2. Date validation if provided
  const startStr = payload.start_at || current.start_at;
  const endStr = payload.end_at || current.end_at;
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  if (endDate <= startDate) {
    throw new Error('Campaign end date must be strictly after the start date.');
  }

  // 3. Handle media replacement if new file is provided
  let newStoragePath = currentCreative?.storage_path;
  let newMediaUrl = currentCreative?.media_url;
  const mediaType = payload.media_type || currentCreative?.media_type || 'image';

  if (newMediaFile) {
    const mediaValidation = validateMediaFile(newMediaFile, mediaType);
    if (!mediaValidation.valid) {
      throw new Error(mediaValidation.error);
    }

    const fileExt = newMediaFile.name.split('.').pop()?.toLowerCase() || (mediaType === 'video' ? 'mp4' : 'jpg');
    const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 12);
    const uploadedPath = `campaigns/${uniqueId}/${Date.now()}.${fileExt}`;

    const { error: uploadErr } = await supabase.storage
      .from(AD_STORAGE_BUCKET)
      .upload(uploadedPath, newMediaFile, {
        contentType: newMediaFile.type,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadErr) {
      throw new Error(`Failed to upload replacement media: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from(AD_STORAGE_BUCKET)
      .getPublicUrl(uploadedPath);

    // If successful, clean up old storage file
    if (currentCreative?.storage_path) {
      await supabase.storage.from(AD_STORAGE_BUCKET).remove([currentCreative.storage_path]).catch(() => {});
    }

    newStoragePath = uploadedPath;
    newMediaUrl = publicUrlData.publicUrl;
  }

  // 4. Update Campaign table
  const campaignUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (payload.campaign_name !== undefined) campaignUpdates.campaign_name = payload.campaign_name.trim();
  if (payload.advertiser_name !== undefined) campaignUpdates.advertiser_name = payload.advertiser_name.trim();
  if (payload.description !== undefined) campaignUpdates.description = payload.description?.trim() || null;
  if (payload.contact_info !== undefined) campaignUpdates.contact_info = payload.contact_info?.trim() || null;
  if (payload.skip_duration !== undefined) campaignUpdates.skip_duration = payload.skip_duration;
  if (payload.priority !== undefined) campaignUpdates.priority = payload.priority;
  if (payload.start_at !== undefined) campaignUpdates.start_at = startDate.toISOString();
  if (payload.end_at !== undefined) campaignUpdates.end_at = endDate.toISOString();

  // Status transitions
  if (payload.status !== undefined) {
    let targetStatus = payload.status;
    const now = new Date();
    if (targetStatus === 'active' && startDate > now) targetStatus = 'scheduled';
    if (targetStatus === 'active' && now > endDate) targetStatus = 'expired';
    campaignUpdates.status = targetStatus;
  }

  const { data: updatedCamp, error: campErr } = await supabase
    .from('ad_campaigns')
    .update(campaignUpdates)
    .eq('id', id)
    .select()
    .single();

  if (campErr) {
    throw new Error(`Failed to update campaign: ${campErr.message}`);
  }

  // 5. Update Creative table
  if (currentCreative) {
    const creativeUpdates: Record<string, unknown> = {};
    if (newStoragePath && newStoragePath !== currentCreative.storage_path) {
      creativeUpdates.storage_path = newStoragePath;
      creativeUpdates.media_url = newMediaUrl;
    }
    if (payload.media_type) creativeUpdates.media_type = payload.media_type;
    if (payload.destination_url) creativeUpdates.destination_url = payload.destination_url.trim();
    if (payload.cta_label) creativeUpdates.cta_label = payload.cta_label.trim();
    if (newMediaFile) {
      creativeUpdates.file_metadata = {
        file_name: newMediaFile.name,
        file_size: newMediaFile.size,
        mime_type: newMediaFile.type,
      };
    }

    if (Object.keys(creativeUpdates).length > 0) {
      await supabase
        .from('ad_creatives')
        .update(creativeUpdates)
        .eq('id', currentCreative.id);
    }
  }

  const refreshed = await fetchAdminCampaignById(id);
  return refreshed || updatedCamp;
}

/**
 * Delete a campaign and clean up its storage media
 */
export async function deleteAdminCampaign(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  // 1. Get creative storage path for cleanup
  const { data: creatives } = await supabase
    .from('ad_creatives')
    .select('storage_path')
    .eq('campaign_id', id);

  // 2. Delete campaign from DB (cascades to ad_creatives and ad_events)
  const { error } = await supabase
    .from('ad_campaigns')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete campaign: ${error.message}`);
  }

  // 3. Remove media from storage bucket
  if (creatives && creatives.length > 0) {
    const paths = creatives.map((c) => c.storage_path).filter(Boolean);
    if (paths.length > 0) {
      await supabase.storage.from(AD_STORAGE_BUCKET).remove(paths).catch(() => {});
    }
  }
}

/**
 * Pause campaign
 */
export async function pauseAdminCampaign(id: string): Promise<void> {
  const { error } = await supabase
    .from('ad_campaigns')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Resume campaign
 */
export async function resumeAdminCampaign(id: string): Promise<void> {
  const campaign = await fetchAdminCampaignById(id);
  if (!campaign) throw new Error('Campaign not found.');

  const now = new Date();
  const startDate = new Date(campaign.start_at);
  const endDate = new Date(campaign.end_at);

  let targetStatus = 'active';
  if (now > endDate) {
    targetStatus = 'expired';
  } else if (now < startDate) {
    targetStatus = 'scheduled';
  }

  const { error } = await supabase
    .from('ad_campaigns')
    .update({ status: targetStatus, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

/**
 * Fetch Ad Settings
 */
export async function fetchAdSettings(): Promise<AdSettings> {
  if (!isSupabaseConfigured) {
    return {
      id: 'default',
      is_enabled: true,
      max_ads_per_session: 1,
      cooldown_minutes: 15,
      default_skip_duration: 5,
      rotation_strategy: 'fair_round_robin',
      updated_at: new Date().toISOString(),
    };
  }

  const { data, error } = await supabase
    .from('ad_settings')
    .select('*')
    .eq('id', 'default')
    .single();

  if (error || !data) {
    console.warn('Ad settings fallback:', error?.message);
    return {
      id: 'default',
      is_enabled: true,
      max_ads_per_session: 1,
      cooldown_minutes: 15,
      default_skip_duration: 5,
      rotation_strategy: 'fair_round_robin',
      updated_at: new Date().toISOString(),
    };
  }

  return data;
}

/**
 * Update Ad Settings
 */
export async function updateAdSettings(settings: Partial<AdSettings>): Promise<AdSettings> {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured.');

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (settings.is_enabled !== undefined) updates.is_enabled = settings.is_enabled;
  if (settings.max_ads_per_session !== undefined) updates.max_ads_per_session = settings.max_ads_per_session;
  if (settings.cooldown_minutes !== undefined) updates.cooldown_minutes = settings.cooldown_minutes;
  if (settings.default_skip_duration !== undefined) updates.default_skip_duration = settings.default_skip_duration;
  if (settings.rotation_strategy !== undefined) updates.rotation_strategy = settings.rotation_strategy;

  const { data, error } = await supabase
    .from('ad_settings')
    .update(updates)
    .eq('id', 'default')
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Fetch Advertisement Analytics for Admin Dashboard
 */
export async function fetchAdAnalytics(
  startDate?: string,
  endDate?: string,
  campaignId?: string
): Promise<AdAnalyticsData> {
  if (!isSupabaseConfigured) {
    return {
      overall: {
        total_impressions: 0,
        unique_impressions: 0,
        total_clicks: 0,
        total_skips: 0,
        total_completed_views: 0,
        ctr: 0,
        completion_rate: 0,
        skip_rate: 0,
        active_campaigns: 0,
        scheduled_campaigns: 0,
        expired_campaigns: 0,
        paused_campaigns: 0,
        draft_campaigns: 0,
      },
      trends: [],
      campaigns: [],
    };
  }

  const { data, error } = await supabase.rpc('get_ad_analytics', {
    p_start_date: startDate || null,
    p_end_date: endDate || null,
    p_campaign_id: campaignId || null,
  });

  if (error) {
    console.error('Error fetching ad analytics:', error.message);
    throw new Error(error.message);
  }

  return (
    data || {
      overall: {
        total_impressions: 0,
        unique_impressions: 0,
        total_clicks: 0,
        total_skips: 0,
        total_completed_views: 0,
        ctr: 0,
        completion_rate: 0,
        skip_rate: 0,
        active_campaigns: 0,
        scheduled_campaigns: 0,
        expired_campaigns: 0,
        paused_campaigns: 0,
        draft_campaigns: 0,
      },
      trends: [],
      campaigns: [],
    }
  );
}

// ============================================================================
// CUSTOMER-SIDE OPERATIONS & FREQUENCY CONTROLS
// ============================================================================

export const AD_SESSION_KEY = 'vaangly_ad_session_id';
export const AD_SESSION_COUNT_KEY = 'vaangly_ad_session_count';
export const AD_LAST_SHOWN_KEY = 'vaangly_last_ad_shown_ts';
export const AD_LAST_SKIPPED_KEY = 'vaangly_last_ad_skipped_ts';
export const AD_LAST_CAMPAIGN_KEY = 'vaangly_last_seen_campaign_id';

/**
 * Get or create persistent session ID for the browser tab
 */
export function getOrCreateAdSessionId(): string {
  try {
    let sessionId = sessionStorage.getItem(AD_SESSION_KEY);
    if (!sessionId) {
      sessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
      sessionStorage.setItem(AD_SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return `sess_fallback_${Date.now()}`;
  }
}

/**
 * Check whether the customer is currently in a critical shopping or payment transaction
 * Opening ads must NEVER interrupt checkout, payments, or order confirmations.
 */
export function isCriticalTransactionRoute(pathname: string): boolean {
  if (!pathname) return false;
  const p = pathname.toLowerCase();
  return (
    p.startsWith('/cart') ||
    p.startsWith('/checkout') ||
    p.startsWith('/request-confirmation') ||
    p.startsWith('/request') ||
    p.startsWith('/orders') ||
    p.startsWith('/bookings') ||
    p.startsWith('/appointments') ||
    p.startsWith('/complete-profile') ||
    p.startsWith('/auth') ||
    p.startsWith('/login') ||
    p.startsWith('/register') ||
    p.startsWith('/reset-password') ||
    p.startsWith('/shopkeeper') ||
    p.startsWith('/admin')
  );
}

/**
 * Check customer frequency eligibility
 */
export function isEligibleForOpeningAd(settings: AdSettings, pathname: string): boolean {
  // 1. Global switch
  if (!settings.is_enabled) return false;

  // 2. Critical transaction route protection
  if (isCriticalTransactionRoute(pathname)) return false;

  try {
    // 3. Max ads per session
    const sessionCount = parseInt(sessionStorage.getItem(AD_SESSION_COUNT_KEY) || '0', 10);
    if (sessionCount >= settings.max_ads_per_session) {
      return false;
    }

    // 4. Cooldown between opening ads
    const lastShownTs = parseInt(localStorage.getItem(AD_LAST_SHOWN_KEY) || '0', 10);
    const cooldownMs = settings.cooldown_minutes * 60 * 1000;
    if (lastShownTs > 0 && Date.now() - lastShownTs < cooldownMs) {
      return false;
    }

    // 5. Never show immediately after skipping one
    const lastSkippedTs = parseInt(localStorage.getItem(AD_LAST_SKIPPED_KEY) || '0', 10);
    if (lastSkippedTs > 0 && Date.now() - lastSkippedTs < cooldownMs) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Record frequency state after an advertisement is presented
 */
export function markAdDisplayed(campaignId: string): void {
  try {
    const currentCount = parseInt(sessionStorage.getItem(AD_SESSION_COUNT_KEY) || '0', 10);
    sessionStorage.setItem(AD_SESSION_COUNT_KEY, String(currentCount + 1));
    localStorage.setItem(AD_LAST_SHOWN_KEY, String(Date.now()));
    localStorage.setItem(AD_LAST_CAMPAIGN_KEY, campaignId);
  } catch {}
}

/**
 * Record frequency state after an advertisement is skipped
 */
export function markAdSkipped(): void {
  try {
    localStorage.setItem(AD_LAST_SKIPPED_KEY, String(Date.now()));
  } catch {}
}

/**
 * Fetch eligible advertisement for an opening impression
 */
export async function fetchEligibleAd(
  sessionId: string,
  lastSeenCampaignId?: string,
  excludeCampaignIds?: string[]
): Promise<AdEligibleCampaign | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const params: Record<string, unknown> = {
      p_session_id: sessionId,
      p_last_seen_campaign_id: lastSeenCampaignId || null,
    };
    if (excludeCampaignIds && excludeCampaignIds.length > 0) {
      params.p_exclude_campaign_ids = excludeCampaignIds;
    }

    const { data, error } = await supabase.rpc('get_eligible_advertisement', params);

    if (error) {
      console.warn('Error fetching eligible ad:', error.message);
      return null;
    }

    if (!data || data.length === 0) return null;
    return data[0];
  } catch (err) {
    console.warn('Exception in fetchEligibleAd:', err);
    return null;
  }
}

/**
 * Track customer interaction event (Impression, Click, Skip, Completed View, Playback Error)
 */
export async function trackAdEvent(
  campaignId: string,
  creativeId: string,
  impressionId: string,
  sessionId: string,
  eventType: AdEventType,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  if (!isSupabaseConfigured) return false;

  try {
    const { data, error } = await supabase.rpc('record_ad_event', {
      p_campaign_id: campaignId,
      p_creative_id: creativeId,
      p_impression_id: impressionId,
      p_session_id: sessionId,
      p_event_type: eventType,
      p_metadata: metadata || {},
    });

    if (error) {
      console.warn(`Error tracking ad event (${eventType}):`, error.message);
      return false;
    }

    return !!data;
  } catch (err) {
    console.warn(`Exception in trackAdEvent (${eventType}):`, err);
    return false;
  }
}
