import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { MapPin, CheckCircle, AlertCircle, RefreshCw, Compass, ShieldAlert } from 'lucide-react';
import { Button } from '../ui/Button';
import { reverseGeocodeCoordinates } from '../../lib/reverseGeocode';
import { ShopkeeperMapPicker } from '../gis/ShopkeeperMapPicker';
import './GPSLocationPicker.css';

export interface CapturedLocation {
  lat: number;
  lng: number;
  accuracy: number;
  address: string | null;
  stage?: 'coarse' | 'high_accuracy';
}

import { AccuracyTier, getAccuracyTier } from '../../lib/locationAccuracy';
export type { AccuracyTier };
export { getAccuracyTier };

export interface GPSLocationPickerProps {
  initialLat?: number | null;
  initialLng?: number | null;
  initialAccuracy?: number | null;
  initialAddress?: string | null;
  onLocationCaptured: (coords: CapturedLocation) => void;
  onManualFallback?: () => void;
  disabled?: boolean;
  required?: boolean;
}

export const GPSLocationPicker: React.FC<GPSLocationPickerProps> = ({
  initialLat,
  initialLng,
  initialAccuracy,
  initialAddress,
  onLocationCaptured,
  onManualFallback,
  disabled = false,
  required = false,
}) => {
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy?: number } | null>(
    initialLat != null && initialLng != null
      ? { lat: initialLat, lng: initialLng, accuracy: initialAccuracy ?? undefined }
      : null
  );
  const [isLocating, setIsLocating] = useState(false);
  const [isAdjustingOnMap, setIsAdjustingOnMap] = useState<boolean>(false);
  const [activeStage, setActiveStage] = useState<'idle' | 'coarse' | 'refining' | 'geocoding'>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{
    code?: string;
    title: string;
    message: string;
    canRetry: boolean;
  } | null>(null);
  const [address, setAddress] = useState<string | null>(initialAddress || null);
  const [geocodingNotice, setGeocodingNotice] = useState<string | null>(null);

  const handleMapAdjusted = (lat: number, lng: number, detectedAddr: string | null) => {
    setIsAdjustingOnMap(false);
    const finalAccuracy = coords?.accuracy ?? 10;
    setCoords({ lat, lng, accuracy: finalAccuracy });
    if (detectedAddr) setAddress(detectedAddr);
    onLocationCaptured({
      lat,
      lng,
      accuracy: finalAccuracy,
      address: detectedAddr || address,
      stage: 'high_accuracy',
    });
  };

  const finishCapture = async (
    lat: number,
    lng: number,
    accuracy: number,
    stage: 'coarse' | 'high_accuracy'
  ) => {
    setCoords({ lat, lng, accuracy });
    setErrorDetails(null);
    setActiveStage('geocoding');
    setStatusMessage('Detecting street address from location...');
    setGeocodingNotice(null);

    try {
      const detectedAddress = await reverseGeocodeCoordinates(lat, lng);
      setAddress(detectedAddress);
      onLocationCaptured({ lat, lng, accuracy, address: detectedAddress, stage });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Address lookup was unavailable.';
      setAddress(null);
      setGeocodingNotice(
        `${message} Coordinates (±${accuracy}m) were captured successfully. Please enter your physical address manually below.`
      );
      onLocationCaptured({ lat, lng, accuracy, address: null, stage });
    } finally {
      setActiveStage('idle');
      setStatusMessage(null);
      setIsLocating(false);
    }
  };

  const getBrowserPosition = (options: PositionOptions): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error('Geolocation is not supported by your browser/device.'));
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  };

  const handleCaptureLocation = async () => {
    setErrorDetails(null);
    setGeocodingNotice(null);

    const isNative = Capacitor.isNativePlatform();

    // ----------------------------------------------------
    // NATIVE CAPACITOR IMPLEMENTATION (Android / iOS app)
    // ----------------------------------------------------
    if (isNative) {
      setIsLocating(true);
      try {
        let permissions = await Geolocation.checkPermissions();
        if (permissions.location !== 'granted') {
          permissions = await Geolocation.requestPermissions();
        }
        if (permissions.location !== 'granted') {
          setErrorDetails({
            code: 'PERMISSION_DENIED',
            title: 'Location Permission Denied',
            message:
              'Location permission was not granted. Please allow location access in your device settings or enter your shop address manually.',
            canRetry: true,
          });
          setIsLocating(false);
          return;
        }

        // Stage 1: Fast / Coarse Native fix
        setActiveStage('coarse');
        setStatusMessage('Getting your location...');
        let coarsePosition: { lat: number; lng: number; accuracy: number } | null = null;

        try {
          const fastPos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 60000,
          });
          const lat = parseFloat(fastPos.coords.latitude.toFixed(6));
          const lng = parseFloat(fastPos.coords.longitude.toFixed(6));
          const accuracy = Math.round(fastPos.coords.accuracy || 0);

          if (accuracy <= 60) {
            await finishCapture(lat, lng, accuracy, 'coarse');
            return;
          }
          coarsePosition = { lat, lng, accuracy };
        } catch {
          // If fast fix fails, proceed to high accuracy
        }

        // Stage 2: High-accuracy Native satellite fix
        setActiveStage('refining');
        setStatusMessage('Refining with high-accuracy GPS (satellite lock in progress)...');

        try {
          const finePos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 25000,
            maximumAge: 0,
          });
          const lat = parseFloat(finePos.coords.latitude.toFixed(6));
          const lng = parseFloat(finePos.coords.longitude.toFixed(6));
          const accuracy = Math.round(finePos.coords.accuracy || 0);
          await finishCapture(lat, lng, accuracy, 'high_accuracy');
        } catch (fineErr) {
          if (coarsePosition) {
            // High-accuracy timed out, but coarse position was obtained
            await finishCapture(
              coarsePosition.lat,
              coarsePosition.lng,
              coarsePosition.accuracy,
              'coarse'
            );
          } else {
            setErrorDetails({
              title: 'Unable to Determine GPS Position',
              message:
                fineErr instanceof Error
                  ? fineErr.message
                  : 'GPS satellite lock timed out. Check that device Location/GPS is turned on, or enter your address manually below.',
              canRetry: true,
            });
            setIsLocating(false);
            setActiveStage('idle');
            setStatusMessage(null);
          }
        }
      } catch (err) {
        setErrorDetails({
          title: 'Location Error',
          message:
            err instanceof Error
              ? err.message
              : 'Unable to retrieve device GPS coordinates. Please retry or enter your address manually.',
          canRetry: true,
        });
        setIsLocating(false);
        setActiveStage('idle');
        setStatusMessage(null);
      }
      return;
    }

    // ----------------------------------------------------
    // WEB BROWSER IMPLEMENTATION (Desktop / Mobile Web)
    // ----------------------------------------------------
    if (!navigator.geolocation) {
      setErrorDetails({
        title: 'Geolocation Not Supported',
        message: 'Your browser or device does not support the Geolocation API. Please enter your shop address manually.',
        canRetry: false,
      });
      return;
    }

    // Check Secure Context (HTTPS or localhost)
    if (!window.isSecureContext) {
      setErrorDetails({
        code: 'INSECURE_CONTEXT',
        title: 'Secure Connection Required (HTTPS)',
        message:
          'Browser location access is restricted to secure connections (HTTPS) or localhost. Browsers block geolocation over unencrypted local networks (e.g. http://192.168.x.x). Please test on localhost, use HTTPS, or enter your physical address manually below.',
        canRetry: false,
      });
      return;
    }

    // Check Permissions API (if available)
    if (navigator.permissions?.query) {
      try {
        const permStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (permStatus.state === 'denied') {
          setErrorDetails({
            code: 'PERMISSION_DENIED',
            title: 'Location Permission Blocked',
            message:
              'Location access is blocked for this site in your browser settings. On Chrome/Android: tap the lock/tune icon next to the address bar -> Permissions -> Location -> Allow. On iOS Safari: Settings -> Safari -> Location -> Allow. Then tap Try Again, or enter your address manually.',
            canRetry: true,
          });
          return;
        }
      } catch {
        // Permissions API restricted or unsupported; continue to getCurrentPosition
      }
    }

    setIsLocating(true);

    // Stage 1: Fast / Coarse Browser Position (Cached / Network)
    setActiveStage('coarse');
    setStatusMessage('Getting your location...');
    let coarsePosition: { lat: number; lng: number; accuracy: number } | null = null;

    try {
      const fastPos = await getBrowserPosition({
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 60000,
      });
      const lat = parseFloat(fastPos.coords.latitude.toFixed(6));
      const lng = parseFloat(fastPos.coords.longitude.toFixed(6));
      const accuracy = Math.round(fastPos.coords.accuracy);

      // If accuracy is high enough (<= 60m), accept immediately
      if (accuracy <= 60) {
        await finishCapture(lat, lng, accuracy, 'coarse');
        return;
      }
      coarsePosition = { lat, lng, accuracy };
    } catch {
      // Coarse fix timed out or unavailable, proceed directly to satellite GPS
    }

    // Stage 2: High-accuracy Satellite GPS
    setActiveStage('refining');
    setStatusMessage('Trying high-accuracy GPS (connecting to satellites)...');

    try {
      const finePos = await getBrowserPosition({
        enableHighAccuracy: true,
        timeout: 25000,
        maximumAge: 0,
      });
      const lat = parseFloat(finePos.coords.latitude.toFixed(6));
      const lng = parseFloat(finePos.coords.longitude.toFixed(6));
      const accuracy = Math.round(finePos.coords.accuracy);
      await finishCapture(lat, lng, accuracy, 'high_accuracy');
    } catch (err: unknown) {
      // If Stage 2 fails but Stage 1 gave us a coarse position, use Stage 1!
      if (coarsePosition) {
        await finishCapture(
          coarsePosition.lat,
          coarsePosition.lng,
          coarsePosition.accuracy,
          'coarse'
        );
        return;
      }

      setIsLocating(false);
      setActiveStage('idle');
      setStatusMessage(null);

      const geoErr = err as GeolocationPositionError;
      switch (geoErr?.code) {
        case 1: // PERMISSION_DENIED
          setErrorDetails({
            code: 'PERMISSION_DENIED',
            title: 'Location Permission Denied',
            message:
              'Location permission was denied. Tap the lock/tune icon near your browser address bar to allow Location, or enter your shop address manually below.',
            canRetry: true,
          });
          break;
        case 2: // POSITION_UNAVAILABLE
          setErrorDetails({
            code: 'POSITION_UNAVAILABLE',
            title: 'Location Unavailable',
            message:
              'Your device could not detect a location signal. Please ensure device Location/GPS is turned on in system settings, step closer to a window, or enter your physical address manually below.',
            canRetry: true,
          });
          break;
        case 3: // TIMEOUT
          setErrorDetails({
            code: 'TIMEOUT',
            title: 'GPS Request Timed Out',
            message:
              'Satellite GPS took longer than 25 seconds to establish a lock. You can try again or enter your shop address manually below.',
            canRetry: true,
          });
          break;
        default:
          setErrorDetails({
            title: 'Unable to Detect Location',
            message:
              geoErr?.message ||
              'Unable to retrieve device GPS coordinates. Please try again or enter your shop address manually below.',
            canRetry: true,
          });
          break;
      }
    }
  };

  const accuracyTier = coords?.accuracy != null ? getAccuracyTier(coords.accuracy) : null;

  return (
    <div className="vaango-gps-picker">
      <div className="vaango-gps-picker__header">
        <label className="vaango-gps-picker__label">
          <Compass size={17} className="text-primary" />
          <span>Live Storefront Location</span>
          {required ? (
            <span className="vaango-required">*</span>
          ) : (
            <span className="vaango-optional-tag">Recommended</span>
          )}
        </label>
        <span className="vaango-gps-picker__hint">
          Detect your storefront coordinates via device GPS for verified delivery accuracy and customer discovery.
        </span>
      </div>

      <div className="vaango-gps-picker__body">
        {/* In-progress state indicator */}
        {isLocating && (
          <div className="vaango-gps-picker__in-progress" role="status">
            <RefreshCw size={18} className="vaango-spin vaango-gps-picker__spinner-icon" />
            <div className="vaango-gps-picker__progress-text">
              <span>{statusMessage || 'Detecting location...'}</span>
              {activeStage === 'refining' && (
                <span className="vaango-optional-tag" style={{ marginLeft: '8px' }}>
                  Stage 2 of 2
                </span>
              )}
            </div>
          </div>
        )}

        {/* Captured state */}
        {!isLocating && coords && (
          <div className="vaango-gps-picker__captured">
            <CheckCircle size={22} className="vaango-gps-success-icon" />
            <div className="vaango-gps-picker__details">
              <div className="vaango-gps-picker__coords">
                <strong>Lat:</strong> {coords.lat}°, <strong>Lng:</strong> {coords.lng}°
              </div>

              {accuracyTier && (
                <div className="vaango-gps-picker__accuracy-row">
                  <span className={`vaango-gps-badge ${accuracyTier.badgeClass}`}>
                    {accuracyTier.label}
                  </span>
                  <span className="vaango-gps-picker__accuracy-text">
                    {accuracyTier.formatted}
                  </span>
                </div>
              )}

              {accuracyTier?.tip && (
                <div className="vaango-gps-picker__tip">
                  {accuracyTier.tip}
                </div>
              )}

              {address && (
                <div className="vaango-gps-picker__address">
                  <strong>Detected address:</strong> {address}
                </div>
              )}

              {geocodingNotice && (
                <div className="vaango-gps-picker__notice">
                  {geocodingNotice}
                </div>
              )}
            </div>

            <div className="vaango-gps-picker__actions-group">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || isLocating}
                onClick={() => setIsAdjustingOnMap(true)}
                leftIcon={<Compass size={14} />}
              >
                Adjust on Map
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || isLocating}
                onClick={handleCaptureLocation}
                leftIcon={<RefreshCw size={14} className={isLocating ? 'vaango-spin' : ''} />}
              >
                Re-capture
              </Button>
            </div>
          </div>
        )}

        {/* Map-based Pin Adjuster Modal/Drawer */}
        {isAdjustingOnMap && coords && (
          <ShopkeeperMapPicker
            initialLat={coords.lat}
            initialLng={coords.lng}
            initialAccuracy={coords.accuracy}
            onConfirmLocation={handleMapAdjusted}
            onCancel={() => setIsAdjustingOnMap(false)}
          />
        )}

        {/* Prompt button state when no coords */}
        {!isLocating && !coords && (
          <div className="vaango-gps-picker__prompt">
            <Button
              type="button"
              variant="primary"
              disabled={disabled || isLocating}
              onClick={handleCaptureLocation}
              isLoading={isLocating}
              leftIcon={<MapPin size={18} />}
            >
              Detect Live Location
            </Button>

            {!window.isSecureContext && (
              <span className="vaango-gps-picker__secure-hint">
                ⚠️ Notice: Geolocation requires HTTPS or localhost. If on a local network (http://192.168.x.x), please enter your address manually below.
              </span>
            )}
          </div>
        )}

        {/* Error box with actionable choices */}
        {errorDetails && (
          <div className="vaango-gps-picker__error-box" role="alert">
            <div className="vaango-gps-picker__error-title-row">
              {errorDetails.code === 'INSECURE_CONTEXT' ? (
                <ShieldAlert size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <strong>{errorDetails.title}</strong>
            </div>
            <p className="vaango-gps-picker__error-msg">{errorDetails.message}</p>

            <div className="vaango-gps-picker__error-actions">
              {errorDetails.canRetry && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCaptureLocation}
                  leftIcon={<RefreshCw size={14} />}
                >
                  Try Again
                </Button>
              )}
              {onManualFallback && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onManualFallback}
                  leftIcon={<MapPin size={14} />}
                >
                  Enter Address Manually
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
