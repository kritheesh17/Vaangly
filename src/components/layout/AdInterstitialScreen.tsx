import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Volume2, VolumeX, ExternalLink, Play, Sparkles, Film } from 'lucide-react';
import {
  fetchAdSettings,
  fetchEligibleAd,
  trackAdEvent,
  isEligibleForOpeningAd,
  getOrCreateAdSessionId,
  markAdDisplayed,
  markAdSkipped,
  AD_LAST_CAMPAIGN_KEY,
} from '../../lib/advertisementApi';
import { AdEligibleCampaign, AdSettings } from '../../types/advertisement';
import './AdInterstitialScreen.css';

export const AdInterstitialScreen: React.FC = () => {
  const location = useLocation();

  const [campaign, setCampaign] = useState<AdEligibleCampaign | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(5);
  const [canSkip, setCanSkip] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState<boolean>(false);
  const [hasRecordedClick, setHasRecordedClick] = useState<boolean>(false);
  const [hasCompletedView, setHasCompletedView] = useState<boolean>(false);
  const [isMediaLoaded, setIsMediaLoaded] = useState<boolean>(false);
  const [isMediaBuffering, setIsMediaBuffering] = useState<boolean>(true);
  const [hasPlaybackError, setHasPlaybackError] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasInitializedRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string>(getOrCreateAdSessionId());
  const timerStartedAtRef = useRef<number | null>(null);
  const skipDurationRef = useRef<number>(5);
  const timerIntervalRef = useRef<number | null>(null);
  const hasRecordedImpressionRef = useRef<boolean>(false);
  const hasHandledErrorRef = useRef<boolean>(false);
  const failedCampaignIdsRef = useRef<Set<string>>(new Set());

  // Safe handler: records persistent impression and anchors wall-clock timer exactly once per campaign
  const handleMediaReady = useCallback(() => {
    if (!campaign) return;

    setIsMediaBuffering(false);
    setIsMediaLoaded(true);

    // If timer hasn't started yet for this campaign, anchor wall-clock timer immediately
    if (timerStartedAtRef.current === null) {
      timerStartedAtRef.current = Date.now();
      const dur = campaign.skip_duration || 5;
      skipDurationRef.current = dur;
      setSecondsRemaining(dur);
      setCanSkip(false);
    }

    // Only record impression and frequency metrics once per campaign
    if (hasRecordedImpressionRef.current) return;
    hasRecordedImpressionRef.current = true;

    // Record persistent frequency markers in browser storage
    markAdDisplayed(campaign.campaign_id);

    // Track confirmed impression event
    trackAdEvent(
      campaign.campaign_id,
      campaign.creative_id,
      campaign.impression_id,
      sessionIdRef.current,
      'impression'
    ).catch(() => {});
  }, [campaign]);

  // Safe Fallback: when an ad creative fails, record error and try fallback; if none, show graceful fallback
  // Failed creatives MUST NEVER call markAdDisplayed or setIsVisible(false).
  const handleMediaError = useCallback(async () => {
    if (!campaign) return;

    // 1. Immediately anchor wall-clock timer so repeated errors or network awaits cannot shift/restart countdown
    if (timerStartedAtRef.current === null) {
      timerStartedAtRef.current = Date.now();
      const dur = campaign.skip_duration || 5;
      skipDurationRef.current = dur;
      setSecondsRemaining(dur);
      setCanSkip(false);
    }

    // 2. Guard against duplicate error handling for the current campaign
    if (hasHandledErrorRef.current) return;
    hasHandledErrorRef.current = true;

    const failedId = campaign.campaign_id;
    failedCampaignIdsRef.current.add(failedId);

    // Track playback error event
    trackAdEvent(
      campaign.campaign_id,
      campaign.creative_id,
      campaign.impression_id,
      sessionIdRef.current,
      'playback_error',
      { error: 'Media failed to load or play' }
    ).catch(() => {});

    // If we haven't exceeded retry threshold (max 2 fallback attempts), try next eligible campaign
    if (failedCampaignIdsRef.current.size < 3) {
      try {
        const lastSeenId = localStorage.getItem(AD_LAST_CAMPAIGN_KEY) || undefined;
        const fallbackAd = await fetchEligibleAd(
          sessionIdRef.current,
          lastSeenId,
          Array.from(failedCampaignIdsRef.current)
        );

        if (fallbackAd && !failedCampaignIdsRef.current.has(fallbackAd.campaign_id)) {
          // Switch to fallback campaign cleanly
          hasHandledErrorRef.current = false;
          hasRecordedImpressionRef.current = false;
          timerStartedAtRef.current = null;
          setIsMediaLoaded(false);
          setIsMediaBuffering(true);
          setHasCompletedView(false);
          setHasRecordedClick(false);
          setAutoplayBlocked(false);
          setHasPlaybackError(false);
          setCampaign(fallbackAd);
          const newDur = fallbackAd.skip_duration || 5;
          skipDurationRef.current = newDur;
          setSecondsRemaining(newDur);
          setCanSkip(false);
          return;
        }
      } catch (err) {
        console.warn('Fallback advertisement retrieval warning:', err);
      }
    }

    // If no alternative campaign is available:
    // PRESERVE the interstitial overlay and display a graceful fallback card.
    // NEVER dismiss the overlay (no setIsVisible(false)) and NEVER consume user frequency quotas (no markAdDisplayed).
    setIsMediaBuffering(false);
    setHasPlaybackError(true);
    setIsMediaLoaded(true);
  }, [campaign]);

  // 1. Initial Evaluation on App Open
  useEffect(() => {
    // Only evaluate once per page reload/launch
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    async function evaluateAndLoadAd() {
      try {
        const settings: AdSettings = await fetchAdSettings();

        // Check customer frequency & route eligibility
        if (!isEligibleForOpeningAd(settings, location.pathname)) {
          return;
        }

        const lastSeenId = localStorage.getItem(AD_LAST_CAMPAIGN_KEY) || undefined;
        const eligibleAd = await fetchEligibleAd(
          sessionIdRef.current,
          lastSeenId,
          Array.from(failedCampaignIdsRef.current)
        );

        if (!eligibleAd) {
          return;
        }

        // Prepare campaign presentation
        setCampaign(eligibleAd);
        const skipDur = eligibleAd.skip_duration || settings.default_skip_duration || 5;
        skipDurationRef.current = skipDur;
        setSecondsRemaining(skipDur);
        setCanSkip(false);
        hasRecordedImpressionRef.current = false;
        hasHandledErrorRef.current = false;
        timerStartedAtRef.current = null;
        setIsMediaLoaded(false);
        setIsMediaBuffering(true);
        setHasPlaybackError(false);
        setIsVisible(true);
      } catch (err) {
        console.warn('Ad interstitial initialization notice:', err);
      }
    }

    evaluateAndLoadAd();
  }, [location.pathname]);

  // 2. Wall-clock countdown timer: calculates remaining seconds based on Date.now() - timerStartedAtRef.current
  // Guaranteed not to reset or drift during re-renders, buffering, or video completion events.
  useEffect(() => {
    if (!isVisible || !campaign || !isMediaLoaded) return;

    const checkTimer = () => {
      if (timerStartedAtRef.current === null) return;
      const elapsed = (Date.now() - timerStartedAtRef.current) / 1000;
      const remaining = Math.max(0, Math.ceil(skipDurationRef.current - elapsed));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        setCanSkip(true);
      }
    };

    // Run immediate check
    checkTimer();

    // Check frequently (200ms) for responsive second transitions
    const intervalId = window.setInterval(checkTimer, 200);
    timerIntervalRef.current = intervalId;

    return () => {
      window.clearInterval(intervalId);
      timerIntervalRef.current = null;
    };
  }, [isVisible, campaign?.campaign_id, isMediaLoaded]);

  // 3. View completion tracking for image ads (completely independent of skip countdown effect)
  useEffect(() => {
    if (!isVisible || !campaign || hasCompletedView || hasPlaybackError) return;
    if (campaign.media_type === 'image' && canSkip && secondsRemaining === 0) {
      setHasCompletedView(true);
      trackAdEvent(
        campaign.campaign_id,
        campaign.creative_id,
        campaign.impression_id,
        sessionIdRef.current,
        'completed_view'
      ).catch(() => {});
    }
  }, [isVisible, campaign, canSkip, secondsRemaining, hasCompletedView, hasPlaybackError]);

  // Safety fallback: If media doesn't fire load event within 5s, start timer anyway if modal is visible
  useEffect(() => {
    if (!isVisible || isMediaLoaded) return;
    const safetyTimeout = window.setTimeout(() => {
      setIsMediaLoaded(true);
      setIsMediaBuffering(false);
      handleMediaReady();
    }, 5000);

    return () => clearTimeout(safetyTimeout);
  }, [isVisible, isMediaLoaded, handleMediaReady]);

  // 4. Video Playback & Autoplay Handling
  useEffect(() => {
    if (!isVisible || !campaign || campaign.media_type !== 'video' || !videoRef.current || hasPlaybackError) {
      return;
    }

    const videoEl = videoRef.current;
    videoEl.defaultMuted = true;
    videoEl.muted = isMuted;

    const playPromise = videoEl.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setAutoplayBlocked(false);
          setIsMediaBuffering(false);
        })
        .catch((err) => {
          console.warn('Video muted autoplay interrupted/blocked:', err);
          setAutoplayBlocked(true);
          setIsMediaBuffering(false);
        });
    }
  }, [isVisible, campaign, isMuted, hasPlaybackError]);

  // Video progress for view completion (e.g. 90% played or full countdown reached)
  // Analytics tracking is strictly independent of skip timer
  const handleVideoTimeUpdate = () => {
    if (!campaign || hasCompletedView || !videoRef.current) return;
    const { currentTime, duration } = videoRef.current;
    if (duration > 0 && currentTime / duration >= 0.9) {
      setHasCompletedView(true);
      trackAdEvent(
        campaign.campaign_id,
        campaign.creative_id,
        campaign.impression_id,
        sessionIdRef.current,
        'completed_view'
      ).catch(() => {});
    }
  };

  // 5. Click Destination Handling
  const handleAdClick = useCallback(() => {
    if (!campaign) return;

    // Track click event (guarded against spam)
    if (!hasRecordedClick) {
      setHasRecordedClick(true);
      trackAdEvent(
        campaign.campaign_id,
        campaign.creative_id,
        campaign.impression_id,
        sessionIdRef.current,
        'click'
      ).catch(() => {});
    }

    // Safely open destination in new tab
    if (campaign.destination_url) {
      window.open(campaign.destination_url, '_blank', 'noopener,noreferrer');
    }
  }, [campaign, hasRecordedClick]);

  // 6. Skip Handling: strictly requires canSkip=true, secondsRemaining=0, and valid campaign
  // Reaching zero does NOT automatically dismiss; explicit user click is required.
  const handleSkip = useCallback(() => {
    if (!canSkip || secondsRemaining > 0 || !campaign) return;

    markAdSkipped();

    // Track skip event
    trackAdEvent(
      campaign.campaign_id,
      campaign.creative_id,
      campaign.impression_id,
      sessionIdRef.current,
      'skip'
    ).catch(() => {});

    setIsVisible(false);
  }, [canSkip, secondsRemaining, campaign]);

  // Sound Toggle
  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    const nextMuted = !videoRef.current.muted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleManualPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current
      .play()
      .then(() => {
        setAutoplayBlocked(false);
        setIsMediaBuffering(false);
        handleMediaReady();
      })
      .catch(() => {});
  };

  if (!isVisible || !campaign) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Advertisement"
      className="vaango-ad-overlay"
    >
      <div className="vaango-ad-modal">
        {/* Header Bar */}
        <div className="vaango-ad-header">
          <div className="vaango-ad-badge">
            <Sparkles size={13} />
            <span>Sponsored</span>
          </div>

          <div className="vaango-ad-header-right">
            <button
              type="button"
              className={`vaango-ad-skip-btn ${canSkip && secondsRemaining === 0 ? 'ready' : 'waiting'}`}
              onClick={handleSkip}
              disabled={!canSkip || secondsRemaining > 0}
              aria-label={canSkip && secondsRemaining === 0 ? 'Skip advertisement' : `Skip in ${secondsRemaining} seconds`}
            >
              {canSkip && secondsRemaining === 0 ? 'Skip Ad' : `Skip in ${secondsRemaining}s`}
            </button>
          </div>
        </div>

        {/* Media Creative Area (Clickable) */}
        <div
          className="vaango-ad-media-wrapper"
          onClick={handleAdClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleAdClick();
          }}
          aria-label={`Open advertisement link for ${campaign.advertiser_name}`}
        >
          {/* Media Buffering Spinner */}
          {isMediaBuffering && !hasPlaybackError && (
            <div className="vaango-ad-buffering-overlay">
              <div className="vaango-ad-spinner" />
              <span>Loading advertisement...</span>
            </div>
          )}

          {/* Graceful Fallback Creative if media fails and no fallback campaign exists */}
          {hasPlaybackError ? (
            <div className="vaango-ad-playback-fallback">
              <div className="vaango-ad-playback-fallback-icon">
                <Film size={26} />
              </div>
              <h3 className="vaango-ad-playback-fallback-title">{campaign.campaign_name}</h3>
              <p className="vaango-ad-playback-fallback-desc">
                {campaign.description || `Special promotion from ${campaign.advertiser_name}`}
              </p>
              <div className="vaango-ad-playback-fallback-hint">
                Tap to visit {campaign.advertiser_name}
              </div>
            </div>
          ) : campaign.media_type === 'image' ? (
            <img
              src={campaign.media_url}
              alt={campaign.campaign_name || 'Advertisement'}
              className="vaango-ad-media-img"
              onLoad={handleMediaReady}
              onError={handleMediaError}
            />
          ) : (
            <>
              <video
                ref={videoRef}
                src={campaign.media_url}
                className="vaango-ad-media-video"
                autoPlay
                playsInline
                preload="auto"
                loop
                muted={isMuted}
                onLoadedData={() => {
                  setIsMediaBuffering(false);
                  handleMediaReady();
                }}
                onPlaying={() => {
                  setIsMediaBuffering(false);
                  handleMediaReady();
                }}
                onWaiting={() => setIsMediaBuffering(true)}
                onCanPlay={() => setIsMediaBuffering(false)}
                onTimeUpdate={handleVideoTimeUpdate}
                onError={handleMediaError}
                onEnded={() => {
                  if (!hasCompletedView) {
                    setHasCompletedView(true);
                    trackAdEvent(
                      campaign.campaign_id,
                      campaign.creative_id,
                      campaign.impression_id,
                      sessionIdRef.current,
                      'completed_view'
                    ).catch(() => {});
                  }
                }}
              />
              {/* Sound unmute toggle */}
              <button
                type="button"
                className="vaango-ad-video-sound-toggle"
                onClick={toggleSound}
                aria-label={isMuted ? 'Unmute video' : 'Mute video'}
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              {/* Fallback play button if autoplay blocked */}
              {autoplayBlocked && (
                <div
                  className="vaango-ad-play-fallback"
                  onClick={handleManualPlay}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.9)',
                      color: '#0f172a',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Play size={24} fill="#0f172a" style={{ marginLeft: 3 }} />
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    Tap to Play Video
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Info & CTA Bar */}
        <div className="vaango-ad-footer">
          <div className="vaango-ad-info">
            <h4 className="vaango-ad-title">{campaign.campaign_name}</h4>
            <p className="vaango-ad-advertiser">By {campaign.advertiser_name}</p>
          </div>

          <button
            type="button"
            className="vaango-ad-cta-btn"
            onClick={handleAdClick}
          >
            <span>{campaign.cta_label || 'Learn More'}</span>
            <ExternalLink size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};
