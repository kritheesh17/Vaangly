import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { getTileLayerConfig } from '../../lib/mapConfig';
import { useTheme } from '../../context/ThemeContext';
import './StorefrontMapPreview.css';

export interface StorefrontMapPreviewProps {
  lat: number;
  lng: number;
  title?: string;
  height?: number | string;
}

export const StorefrontMapPreview: React.FC<StorefrontMapPreviewProps> = ({
  lat,
  lng,
  title,
  height = 200,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const { isDark } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });

    const tileCfg = getTileLayerConfig(isDark);
    L.tileLayer(tileCfg.url, {
      maxZoom: tileCfg.maxZoom,
      minZoom: tileCfg.minZoom,
      subdomains: tileCfg.subdomains,
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: 'vaango-preview-pin-icon',
      html: `
        <div class="vaango-preview-pin">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
            <path d="M2 7h20"/>
          </svg>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 26],
    });

    const marker = L.marker([lat, lng], { icon: pinIcon, title: title || 'Storefront' }).addTo(map);
    if (title) {
      marker.bindPopup(`<strong>${title}</strong>`, { offset: [0, -20] });
    }

    mapRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, title, isDark]);

  return (
    <div
      ref={containerRef}
      className="vaango-storefront-map-preview"
      style={{ height }}
      role="img"
      aria-label={`Map location preview for ${title || 'storefront'}`}
    />
  );
};
