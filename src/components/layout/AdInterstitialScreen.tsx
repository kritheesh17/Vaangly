import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Volume2, VolumeX, ExternalLink, Play, Sparkles } from 'lucide-react';
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hasInitializedRef = useRef<boolean>(false);
  const sessionIdRef = useRef<string>(getOrCreateAdSessionId());
  const timerRef = useRef<number | null>(null);
  const hasRecordedImpressionRef = useRef<boolean>(false);
  const failedCampaignIdsRef = useRef<Set<string>>(new Set());

  // Safe handler: records persistent impression and frequency metrics ONLY when media actually displays/plays
  const handleMediaReady = useCallback(() => {
    if (!campaign || hasRecordedImpressionRef.current) return;
    hasRecordedImpressionRef.current = true;
    setIsMediaLoaded(true);
    setIsMediaBuffering(false);

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

  // Safe Fallback: when an ad creative fails, record error and immediately try another eligible campaign
  const handleMediaError = useCallback(async () => {
    if (!campaign) return;
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
          // Switch to fallback campaign
          hasRecordedImpressionRef.current = false;
          setIsMediaLoaded(false);
          setIsMediaBuffering(true);
          setHasCompletedView(false);
          setHasRecordedClick(false);
          setAutoplayBlocked(false);
          setCampaign(fallbackAd);
          setSecondsRemaining(fallbackAd.skip_duration || 5);
          setCanSkip(false);
          return;
        }
      } catch (err) {
        console.warn('Fallback advertisement retrieval warning:', err);
      }
    }

    // If no valid fallback exists, dismiss overlay gracefully
    setIsVisible(false);
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
        setSecondsRemaining(skipDur);
        setCanSkip(false);
        hasRecordedImpressionRef.current = false;
        setIsMediaLoaded(false);
        setIsMediaBuffering(true);
        setIsVisible(true);
      } catch (err) {
        console.warn('Ad interstitial initialization notice:', err);
      }
    }

    evaluateAndLoadAd();
  }, [location.pathname]);

  // 2. Countdown Timer: Only decrements once media is verified loaded/playing (or safety threshold reached)
  useEffect(() => {
    if (!isVisible || !campaign) return;

    // Wait until media is loaded before counting down
    if (!isMediaLoaded) return;

    timerRef.current = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setCanSkip(true);

          // For image ads, reaching the countdown satisfies completed view
          if (campaign.media_type === 'image' && !hasCompletedView) {
            setHasCompletedView(true);
            trackAdEvent(
              campaign.campaign_id,
              campaign.creative_id,
              campaign.impression_id,
              sessionIdRef.current,
              'completed_view'
            ).catch(() => {});
          }

          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isVisible, campaign, isMediaLoaded, hasCompletedView]);

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

  // 3. Video Playback & Autoplay Handling
  useEffect(() => {
    if (!isVisible || !campaign || campaign.media_type !== 'video' || !videoRef.current) {
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
  }, [isVisible, campaign, isMuted]);

  // Video progress for view completion (e.g. 90% played or full countdown reached)
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

  // 4. Click Destination Handling
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

  // 5. Skip Handling
  const handleSkip = useCallback(() => {
    if (!canSkip || !campaign) return;

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
  }, [canSkip, campaign]);

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
              className={`vaango-ad-skip-btn ${canSkip ? 'ready' : 'waiting'}`}
              onClick={handleSkip}
              disabled={!canSkip}
              aria-label={canSkip ? 'Skip advertisement' : `Skip in ${secondsRemaining} seconds`}
            >
              {canSkip ? 'Skip Ad' : `Skip in ${secondsRemaining}s`}
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
          {isMediaBuffering && (
            <div className="vaango-ad-buffering-overlay">
              <div className="vaango-ad-spinner" />
              <span>Loading advertisement...</span>
            </div>
          )}

          {campaign.media_type === 'image' ? (
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
