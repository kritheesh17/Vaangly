import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { getTileLayerConfig } from '../../lib/mapConfig';
import { reverseGeocodeCoordinates } from '../../lib/reverseGeocode';
import { useTheme } from '../../context/ThemeContext';
import { Button } from '../ui/Button';
import { MapPin, Check, X, AlertTriangle, RefreshCw, Navigation } from 'lucide-react';
import './ShopkeeperMapPicker.css';

export interface ShopkeeperMapPickerProps {
  initialLat: number;
  initialLng: number;
  initialAccuracy?: number | null;
  onConfirmLocation: (lat: number, lng: number, address: string | null) => void;
  onCancel: () => void;
}

export const ShopkeeperMapPicker: React.FC<ShopkeeperMapPickerProps> = ({
  initialLat,
  initialLng,
  initialAccuracy,
  onConfirmLocation,
  onCancel,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);

  const { isDark } = useTheme();

  const [currentLat, setCurrentLat] = useState<number>(initialLat);
  const [currentLng, setCurrentLng] = useState<number>(initialLng);
  const [detectedAddress, setDetectedAddress] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [geocodingNotice, setGeocodingNotice] = useState<string | null>(null);

  // Reverse geocode when coordinates change
  const fetchAddressForCoords = useCallback(async (lat: number, lng: number) => {
    setIsGeocoding(true);
    setGeocodingNotice(null);
    try {
      const addr = await reverseGeocodeCoordinates(lat, lng);
      setDetectedAddress(addr);
    } catch {
      setDetectedAddress(null);
      setGeocodingNotice('Location selected successfully, but street address could not be detected. You can enter it manually.');
    } finally {
      setIsGeocoding(false);
    }
  }, []);

  // Initial geocode lookup
  useEffect(() => {
    fetchAddressForCoords(initialLat, initialLng);
  }, [initialLat, initialLng, fetchAddressForCoords]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 16,
      zoomControl: true,
    });

    const tileCfg = getTileLayerConfig(isDark);
    L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      maxZoom: tileCfg.maxZoom,
      minZoom: tileCfg.minZoom,
      subdomains: tileCfg.subdomains,
    }).addTo(map);

    // Draggable Storefront Pin
    const pinIcon = L.divIcon({
      className: 'vaango-picker-pin-icon',
      html: `
        <div class="vaango-picker-draggable-pin">
          <div class="vaango-picker-pin-head">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
              <path d="M2 7h20"/>
            </svg>
          </div>
          <div class="vaango-picker-pin-point"></div>
        </div>
      `,
      iconSize: [40, 48],
      iconAnchor: [20, 46],
    });

    const marker = L.marker([initialLat, initialLng], {
      icon: pinIcon,
      draggable: true,
      title: 'Drag pin to storefront',
    }).addTo(map);

    markerRef.current = marker;

    // Optional GPS accuracy circle around original position
    if (initialAccuracy && initialAccuracy > 15) {
      const circle = L.circle([initialLat, initialLng], {
        radius: initialAccuracy,
        color: '#D97706',
        weight: 1.5,
        opacity: 0.6,
        fillColor: '#F59E0B',
        fillOpacity: 0.08,
        dashArray: '3, 5',
      }).addTo(map);
      accuracyCircleRef.current = circle;
    }

    // Handle Pin Drag
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      const newLat = Number(pos.lat.toFixed(7));
      const newLng = Number(pos.lng.toFixed(7));
      setCurrentLat(newLat);
      setCurrentLng(newLng);
      fetchAddressForCoords(newLat, newLng);
    });

    // Handle Map Click (moves pin)
    map.on('click', (e: L.LeafletMouseEvent) => {
      const newLat = Number(e.latlng.lat.toFixed(7));
      const newLng = Number(e.latlng.lng.toFixed(7));
      marker.setLatLng([newLat, newLng]);
      setCurrentLat(newLat);
      setCurrentLng(newLng);
      fetchAddressForCoords(newLat, newLng);
    });

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [initialLat, initialLng, initialAccuracy, isDark, fetchAddressForCoords]);

  const handleResetToGps = () => {
    if (!markerRef.current || !mapInstanceRef.current) return;
    markerRef.current.setLatLng([initialLat, initialLng]);
    mapInstanceRef.current.setView([initialLat, initialLng], 16);
    setCurrentLat(initialLat);
    setCurrentLng(initialLng);
    fetchAddressForCoords(initialLat, initialLng);
  };

  const handleConfirm = () => {
    onConfirmLocation(currentLat, currentLng, detectedAddress);
  };

  return (
    <div className="vaango-shopkeeper-map-picker" role="dialog" aria-label="Adjust Storefront Location on Map">
      <div className="vaango-map-picker__header">
        <div className="vaango-map-picker__title-row">
          <MapPin size={18} className="vaango-map-picker__icon" />
          <h3 className="vaango-map-picker__title">Adjust Storefront Location</h3>
        </div>
        <p className="vaango-map-picker__subtitle">
          Drag the pin or tap the map to place your shop at the exact storefront entrance.
        </p>
      </div>

      {/* Accuracy Warning if GPS confidence was coarse */}
      {initialAccuracy && initialAccuracy > 100 && (
        <div className="vaango-map-picker__warning" role="alert">
          <AlertTriangle size={15} />
          <span>
            Initial GPS accuracy was ±{Math.round(initialAccuracy)}m. Adjust the pin to match your actual shop entrance.
          </span>
        </div>
      )}

      {/* Map Container */}
      <div className="vaango-map-picker__canvas-wrapper">
        <div ref={mapContainerRef} className="vaango-map-picker__canvas" />
        <button
          type="button"
          className="vaango-map-picker__reset-gps-btn"
          onClick={handleResetToGps}
          title="Reset to initial GPS position"
        >
          <Navigation size={13} />
          <span>Reset to GPS</span>
        </button>
      </div>

      {/* Coordinate & Address Preview Card */}
      <div className="vaango-map-picker__info-card">
        <div className="vaango-map-picker__coords-row">
          <div className="vaango-map-picker__coord-item">
            <span className="vaango-map-picker__coord-label">Latitude:</span>
            <strong>{currentLat.toFixed(6)}</strong>
          </div>
          <div className="vaango-map-picker__coord-item">
            <span className="vaango-map-picker__coord-label">Longitude:</span>
            <strong>{currentLng.toFixed(6)}</strong>
          </div>
        </div>

        <div className="vaango-map-picker__address-preview">
          <span className="vaango-map-picker__address-label">Detected Address:</span>
          {isGeocoding ? (
            <div className="vaango-map-picker__geocoding-spinner">
              <RefreshCw size={13} className="vaango-spin" />
              <span>Detecting address...</span>
            </div>
          ) : detectedAddress ? (
            <p className="vaango-map-picker__address-text">{detectedAddress}</p>
          ) : (
            <p className="vaango-map-picker__address-empty">
              {geocodingNotice || 'Address could not be determined. Coordinates remain valid.'}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="vaango-map-picker__actions">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} leftIcon={<X size={14} />}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleConfirm}
          disabled={isGeocoding}
          leftIcon={<Check size={14} />}
        >
          Confirm Location
        </Button>
      </div>
    </div>
  );
};
