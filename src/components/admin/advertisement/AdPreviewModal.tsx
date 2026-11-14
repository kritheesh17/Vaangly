import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  ExternalLink,
  Sparkles,
  Smartphone,
  Monitor,
  RotateCcw,
} from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { AdCampaign } from '../../../types/advertisement';

interface AdPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaign: AdCampaign | null;
}

export const AdPreviewModal: React.FC<AdPreviewModalProps> = ({
  isOpen,
  onClose,
  campaign,
}) => {
  const [deviceMode, setDeviceMode] = useState<'mobile' | 'desktop'>('desktop');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(5);
  const [canSkip, setCanSkip] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const creative = campaign?.creatives?.[0];
  const skipDuration = campaign?.skip_duration || 5;

  const resetSimulation = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecondsRemaining(skipDuration);
    setCanSkip(false);

    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }

    timerRef.current = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setCanSkip(true);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (!isOpen || !campaign) return;
    resetSimulation();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, campaign, skipDuration]);

  if (!campaign || !creative) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Advertisement Customer Preview"
      description="Simulate the customer experience on desktop or mobile device screens."
      maxWidth="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
        {/* Device Viewport Toggle & Reset Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            background: 'var(--color-bg-secondary, rgba(0,0,0,0.03))',
            padding: '8px 16px',
            borderRadius: '10px',
            border: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => setDeviceMode('desktop')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: deviceMode === 'desktop' ? 'var(--color-primary)' : 'transparent',
                color: deviceMode === 'desktop' ? '#fff' : 'var(--color-text-muted)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <Monitor size={16} />
              <span>Desktop View</span>
            </button>

            <button
              type="button"
              onClick={() => setDeviceMode('mobile')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: deviceMode === 'mobile' ? 'var(--color-primary)' : 'transparent',
                color: deviceMode === 'mobile' ? '#fff' : 'var(--color-text-muted)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              <Smartphone size={16} />
              <span>Mobile View</span>
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={resetSimulation}>
            <RotateCcw size={14} style={{ marginRight: '6px' }} />
            Restart Timer
          </Button>
        </div>

        {/* Simulated Stage */}
        <div
          style={{
            width: '100%',
            minHeight: '480px',
            background: 'rgba(10, 15, 25, 0.94)',
            borderRadius: '14px',
            padding: '24px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Simulated Interstitial Modal */}
          <div
            style={{
              width: '100%',
              maxWidth: deviceMode === 'mobile' ? '360px' : '540px',
              background: '#1e293b',
              borderRadius: deviceMode === 'mobile' ? '12px' : '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              transition: 'all 0.3s ease',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'rgba(15, 23, 42, 0.9)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 8px',
                  borderRadius: '5px',
                  background: 'rgba(255, 255, 255, 0.12)',
                  color: '#f1f5f9',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                <Sparkles size={12} />
                <span>Sponsored</span>
              </div>

              <button
                type="button"
                disabled={!canSkip}
                style={{
                  padding: '5px 12px',
                  borderRadius: '18px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: canSkip ? 'pointer' : 'not-allowed',
                  background: canSkip ? '#f59e0b' : 'rgba(255, 255, 255, 0.15)',
                  color: canSkip ? '#0f172a' : '#94a3b8',
                  transition: 'all 0.2s ease',
                }}
              >
                {canSkip ? 'Skip Ad' : `Skip in ${secondsRemaining}s`}
              </button>
            </div>

            {/* Media Creative */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxHeight: deviceMode === 'mobile' ? '300px' : '360px',
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              onClick={() => {
                if (creative.destination_url) {
                  window.open(creative.destination_url, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              {creative.media_type === 'image' ? (
                <img
                  src={creative.media_url}
                  alt={campaign.campaign_name}
                  style={{
                    width: '100%',
                    maxHeight: deviceMode === 'mobile' ? '300px' : '360px',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              ) : (
                <>
                  <video
                    ref={videoRef}
                    src={creative.media_url}
                    autoPlay
                    playsInline
                    muted={isMuted}
                    loop
                    style={{
                      width: '100%',
                      maxHeight: deviceMode === 'mobile' ? '300px' : '360px',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (videoRef.current) {
                        videoRef.current.muted = !isMuted;
                        setIsMuted(!isMuted);
                      }
                    }}
                    style={{
                      position: 'absolute',
                      bottom: '10px',
                      left: '10px',
                      background: 'rgba(0,0,0,0.65)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#fff',
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                </>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#1e293b',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                gap: '12px',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {campaign.campaign_name}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  By {campaign.advertiser_name}
                </div>
              </div>

              <a
                href={creative.destination_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  background: 'var(--color-primary, #0a7b83)',
                  color: '#fff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                <span>{creative.cta_label || 'Learn More'}</span>
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>

        {/* Destination Target Info */}
        <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
          Destination URL: <code style={{ color: 'var(--color-primary)' }}>{creative.destination_url}</code>
        </div>
      </div>
    </Modal>
  );
};
