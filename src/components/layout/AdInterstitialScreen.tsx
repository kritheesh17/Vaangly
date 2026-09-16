import React, { useEffect, useState } from 'react';

const AD_DURATION_SECONDS = 5;
const AD_SHOWN_KEY = 'vaango_ad_shown';

export const AdInterstitialScreen: React.FC = () => {
  const [secondsRemaining, setSecondsRemaining] = useState(AD_DURATION_SECONDS);
  const [visible, setVisible] = useState(() => sessionStorage.getItem(AD_SHOWN_KEY) !== 'true');

  useEffect(() => {
    if (!visible) return;
    const timer = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          sessionStorage.setItem(AD_SHOWN_KEY, 'true');
          setVisible(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    sessionStorage.setItem(AD_SHOWN_KEY, 'true');
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Advertisement"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(15, 24, 40, 0.94)',
      }}
    >
      <div
        style={{
          width: 'min(100%, 560px)',
          padding: '48px 28px',
          textAlign: 'center',
          color: '#fff',
          background: 'linear-gradient(135deg, #0A7B83, #123F4A)',
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.75 }}>
          Advertisement
        </div>
        <h1 style={{ margin: '16px 0 8px', fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}>
          Support your neighborhood businesses
        </h1>
        <p style={{ margin: 0, opacity: 0.85 }}>Advertise locally with Vaango</p>
        <button
          type="button"
          onClick={dismiss}
          style={{
            marginTop: 28,
            padding: '10px 18px',
            color: '#0F1828',
            background: '#F59E0B',
            border: 0,
            borderRadius: 4,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Skip {secondsRemaining > 0 ? `(${secondsRemaining})` : ''}
        </button>
        <div style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>Contact vaango@youremail.com</div>
      </div>
    </div>
  );
};
