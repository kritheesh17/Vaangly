// Advertisement Management System Types

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired' | 'rejected';

export type MediaType = 'image' | 'video';

export type SkipDuration = 5 | 10 | 30;

export type RotationStrategy = 'fair_round_robin' | 'priority_weighted';

export type AdEventType = 'impression' | 'click' | 'skip' | 'completed_view' | 'playback_error';

export interface AdCreative {
  id: string;
  campaign_id: string;
  media_type: MediaType;
  storage_path: string;
  media_url: string;
  destination_url: string;
  cta_label: string;
  file_metadata?: {
    file_name?: string;
    file_size?: number;
    mime_type?: string;
    width?: number;
    height?: number;
    duration?: number;
  };
  created_at: string;
}

export interface AdCampaign {
  id: string;
  campaign_name: string;
  advertiser_name: string;
  description?: string | null;
  contact_info?: string | null;
  status: CampaignStatus;
  skip_duration: SkipDuration;
  start_at: string;
  end_at: string;
  timezone: string;
  priority: number;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  creatives?: AdCreative[];
  // Aggregated performance metrics computed on fetch
  impressions?: number;
  clicks?: number;
  ctr?: number;
}

export interface AdSettings {
  id: 'default';
  is_enabled: boolean;
  max_ads_per_session: number;
  cooldown_minutes: number;
  default_skip_duration: SkipDuration;
  rotation_strategy: RotationStrategy;
  updated_at: string;
  updated_by?: string | null;
}

export interface AdEvent {
  id: string;
  campaign_id: string;
  creative_id?: string | null;
  impression_id: string;
  session_id: string;
  event_type: AdEventType;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface AdEligibleCampaign {
  campaign_id: string;
  creative_id: string;
  campaign_name: string;
  advertiser_name: string;
  description?: string | null;
  media_type: MediaType;
  media_url: string;
  destination_url: string;
  cta_label: string;
  skip_duration: SkipDuration;
  priority: number;
  impression_id: string;
}

export interface AdOverallMetrics {
  total_impressions: number;
  unique_impressions: number;
  total_clicks: number;
  total_skips: number;
  total_completed_views: number;
  ctr: number;
  completion_rate: number;
  skip_rate: number;
  active_campaigns: number;
  scheduled_campaigns: number;
  expired_campaigns: number;
  paused_campaigns: number;
  draft_campaigns: number;
}

export interface AdTrendPoint {
  date: string;
  impressions: number;
  clicks: number;
  skips: number;
  completed_views: number;
  ctr: number;
}

export interface AdCampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  advertiser_name: string;
  status: CampaignStatus;
  media_type: MediaType;
  skip_duration: SkipDuration;
  start_at: string;
  end_at: string;
  impressions: number;
  unique_impressions: number;
  clicks: number;
  skips: number;
  completed_views: number;
  ctr: number;
  completion_rate: number;
}

export interface AdAnalyticsData {
  overall: AdOverallMetrics;
  trends: AdTrendPoint[];
  campaigns: AdCampaignAnalytics[];
}

export interface CreateCampaignPayload {
  campaign_name: string;
  advertiser_name: string;
  description?: string;
  contact_info?: string;
  status?: CampaignStatus;
  skip_duration: SkipDuration;
  start_at: string;
  end_at: string;
  priority?: number;
  // Creative payload
  media_type: MediaType;
  destination_url: string;
  cta_label: string;
}

export interface UpdateCampaignPayload {
  campaign_name?: string;
  advertiser_name?: string;
  description?: string;
  contact_info?: string;
  status?: CampaignStatus;
  skip_duration?: SkipDuration;
  start_at?: string;
  end_at?: string;
  priority?: number;
  // Creative payload
  media_type?: MediaType;
  destination_url?: string;
  cta_label?: string;
}
