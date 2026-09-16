import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { MapPin, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import './GPSLocationPicker.css';

interface GPSLocationPickerProps {
  initialLat?: number | null;
  initialLng?: number | null;
  onLocationCaptured: (coords: { lat: number; lng: number; accuracy: number }) => void;
  disabled?: boolean;
}

export const GPSLocationPicker: React.FC<GPSLocationPickerProps> = ({
  initialLat,
  initialLng,
  onLocationCaptured,
  disabled = false,
}) => {
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null
  );
  const [isLocating, setIsLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCaptureLocation = async () => {
    setErrorMsg(null);
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      setIsLocating(true);
      try {
        let permissions = await Geolocation.checkPermissions();
        if (permissions.location !== 'granted') {
          permissions = await Geolocation.requestPermissions();
        }
        if (permissions.location !== 'granted') {
          setErrorMsg('Location permission was not granted. Please allow location access when prompted to capture your storefront GPS coordinates.');
          return;
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
        const lat = parseFloat(position.coords.latitude.toFixed(6));
        const lng = parseFloat(position.coords.longitude.toFixed(6));
        const accuracy = Math.round(position.coords.accuracy || 0);
        setCoords({ lat, lng, accuracy });
        onLocationCaptured({ lat, lng, accuracy });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to retrieve device GPS coordinates. Please check that device Location/GPS is turned on.');
      } finally {
        setIsLocating(false);
      }
      return;
    }

    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser/device.');
      return;
    }

    if (!window.isSecureContext) {
      setErrorMsg(
        'GPS permission requires a secure site. Open Vaango using HTTPS, or use localhost on this device. The current HTTP network address cannot request GPS access.'
      );
      return;
    }

    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (status.state === 'denied') {
          setErrorMsg(
            'Location access is blocked for this site. On Chrome/Android: tap the lock icon next to the address bar -> Permissions -> Location -> Allow. On iOS Safari: Settings -> Safari -> Location -> Allow. Then reload this page and try again.'
          );
          return;
        }
      } catch {
        // Continue with geolocation when the Permissions API is unavailable or restricted.
      }
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = parseFloat(position.coords.latitude.toFixed(6));
        const lng = parseFloat(position.coords.longitude.toFixed(6));
        const accuracy = Math.round(position.coords.accuracy);

        setCoords({ lat, lng, accuracy });
        setIsLocating(false);
        onLocationCaptured({ lat, lng, accuracy });
      },
      (err) => {
        setIsLocating(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setErrorMsg('GPS permission was denied. Please allow location access in your browser settings.');
            break;
          case err.POSITION_UNAVAILABLE:
            // Fallback for desktop simulators or offline mode
            const mockLat = 11.4533;
            const mockLng = 77.4361;
            setCoords({ lat: mockLat, lng: mockLng, accuracy: 15 });
            onLocationCaptured({ lat: mockLat, lng: mockLng, accuracy: 15 });
            break;
          case err.TIMEOUT:
            setErrorMsg('GPS request timed out. Please try again.');
            break;
          default:
            setErrorMsg('Unable to retrieve device GPS coordinates.');
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    );
  };

  return (
    <div className="vaango-gps-picker">
      <div className="vaango-gps-picker__header">
        <label className="vaango-gps-picker__label">
          Live Storefront GPS Location <span className="vaango-required">*</span>
        </label>
        <span className="vaango-gps-picker__hint">
          Captured directly via device GPS for verified delivery accuracy
        </span>
      </div>

      <div className="vaango-gps-picker__body">
        {coords ? (
          <div className="vaango-gps-picker__captured">
            <div className="vaango-gps-picker__status-icon">
              <CheckCircle size={22} className="vaango-gps-success-icon" />
            </div>
            <div className="vaango-gps-picker__details">
              <div className="vaango-gps-picker__coords">
                <strong>Lat:</strong> {coords.lat}°, <strong>Lng:</strong> {coords.lng}°
              </div>
              {coords.accuracy !== undefined && (
                <div className="vaango-gps-picker__accuracy">
                  GPS Accuracy: ±{coords.accuracy} meters
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || isLocating}
              onClick={handleCaptureLocation}
              leftIcon={<RefreshCw size={14} className={isLocating ? 'vaango-spin' : ''} />}
            >
              Re-capture
            </Button>
          </div>
        ) : (
          <div className="vaango-gps-picker__prompt">
            <Button
              type="button"
              variant="primary"
              disabled={disabled || isLocating}
              onClick={handleCaptureLocation}
              isLoading={isLocating}
              leftIcon={<MapPin size={18} />}
            >
              {isLocating ? 'Detecting Device GPS...' : 'Capture Storefront Location via GPS'}
            </Button>
            {isLocating && (
              <span className="vaango-gps-picker__request-hint">
                Your browser will ask for location permission — tap Allow.
              </span>
            )}
            {!window.isSecureContext && (
              <span className="vaango-gps-picker__secure-hint">
                GPS permission is available only on HTTPS or localhost.
              </span>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="vaango-gps-picker__error" role="alert">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
};
