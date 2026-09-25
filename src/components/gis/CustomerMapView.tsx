import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { Shop } from '../../types/database';
import { formatDistance } from '../../lib/distance';
import { getTileLayerConfig } from '../../lib/mapConfig';
import { useTheme } from '../../context/ThemeContext';
import { Navigation, Store, AlertTriangle } from 'lucide-react';
import './CustomerMapView.css';

export interface CustomerMapViewProps {
  shops: Shop[];
  customerCoords?: { lat: number; lng: number } | null;
  selectedShopId?: string | null;
  onSelectShop?: (shop: Shop) => void;
  radiusMeters?: number;
  selectedLocationName?: string;
  onSwitchToList?: () => void;
}

export const CustomerMapView: React.FC<CustomerMapViewProps> = ({
  shops,
  customerCoords,
  selectedShopId,
  onSelectShop,
  radiusMeters,
  selectedLocationName,
  onSwitchToList,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const customerMarkerRef = useRef<L.Marker | null>(null);

  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [mapError, setMapError] = useState<string | null>(null);

  // Filter shops that have valid geographic coordinates
  const validShops = shops.filter(
    (s) =>
      s.gps_lat != null &&
      s.gps_lng != null &&
      !isNaN(Number(s.gps_lat)) &&
      !isNaN(Number(s.gps_lng)) &&
      Number(s.gps_lat) >= -90 &&
      Number(s.gps_lat) <= 90 &&
      Number(s.gps_lng) >= -180 &&
      Number(s.gps_lng) <= 180
  );

  // If customer location is unavailable AND town shops have no coordinates,
  // Section 20 requires: do NOT invent town coordinates; show unavailable state.
  const isTownMapUnavailable = !customerCoords && validShops.length === 0;

  // Initialize Leaflet Map once
  useEffect(() => {
    if (isTownMapUnavailable) return;
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    try {
      // Determine initial center strictly from customer location or first valid shop
      const initialCenter: [number, number] = customerCoords
        ? [customerCoords.lat, customerCoords.lng]
        : [Number(validShops[0].gps_lat), Number(validShops[0].gps_lng)];

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 14,
        zoomControl: false, // Customized position for mobile
        attributionControl: true,
      });

      // Add Zoom control at top-right to avoid mobile bottom bars
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Tile layer
      const tileCfg = getTileLayerConfig(isDark);
      const tiles = L.tileLayer(tileCfg.url, {
        attribution: tileCfg.attribution,
        maxZoom: tileCfg.maxZoom,
        minZoom: tileCfg.minZoom,
        subdomains: tileCfg.subdomains,
      }).addTo(map);

      tileLayerRef.current = tiles;
      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      // Invalidate size on load to ensure smooth rendering
      setTimeout(() => {
        map.invalidateSize();
      }, 150);
    } catch (err) {
      console.error('Failed to initialize customer map:', err);
      setMapError('Unable to load interactive map. Please use the list view.');
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersLayerRef.current = null;
        customerMarkerRef.current = null;
      }
    };
  }, []);

  // Update Tile Layer when theme changes (light/dark mode)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const tileCfg = getTileLayerConfig(isDark);
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const newTiles = L.tileLayer(tileCfg.url, {
      attribution: tileCfg.attribution,
      maxZoom: tileCfg.maxZoom,
      minZoom: tileCfg.minZoom,
      subdomains: tileCfg.subdomains,
    }).addTo(map);
    tileLayerRef.current = newTiles;
  }, [isDark]);

  // Update Markers and Viewport
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();
    const boundsPoints: L.LatLngExpression[] = [];

    // 1. Customer Location Marker (if available)
    if (customerCoords) {
      const customerLatLng: [number, number] = [customerCoords.lat, customerCoords.lng];
      boundsPoints.push(customerLatLng);

      const customerIcon = L.divIcon({
        className: 'vaango-customer-marker-icon',
        html: `
          <div class="vaango-map-customer-marker" title="You are here">
            <div class="vaango-map-customer-pulse"></div>
            <div class="vaango-map-customer-dot"></div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const customerMarker = L.marker(customerLatLng, {
        icon: customerIcon,
        zIndexOffset: 1000,
        title: 'You are here',
      });
      customerMarker.bindPopup('<div class="vaango-map-popup-customer"><strong>📍 You are here</strong></div>', {
        closeButton: false,
        offset: [0, -10],
      });
      customerMarker.addTo(markersGroup);
      customerMarkerRef.current = customerMarker;

      // Optional Radius Circle (Near Me)
      if (radiusMeters && radiusMeters > 0) {
        L.circle(customerLatLng, {
          radius: radiusMeters,
          color: 'var(--brand-primary, #1B4D3E)',
          weight: 1.5,
          opacity: 0.5,
          fillColor: 'var(--brand-primary, #1B4D3E)',
          fillOpacity: 0.05,
          dashArray: '4, 6',
        }).addTo(markersGroup);
      }
    }

    // 2. Shop Markers
    validShops.forEach((shop) => {
      const lat = Number(shop.gps_lat);
      const lng = Number(shop.gps_lng);
      const latLng: [number, number] = [lat, lng];
      boundsPoints.push(latLng);

      const isSelected = selectedShopId === shop.id;
      const distanceLabel = shop.distance_meters != null ? formatDistance(shop.distance_meters) : '';

      const shopIcon = L.divIcon({
        className: 'vaango-shop-marker-icon',
        html: `
          <div class="vaango-map-shop-marker ${isSelected ? 'vaango-map-shop-marker--selected' : ''}">
            <div class="vaango-map-shop-marker__pin">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
                <path d="M2 7h20"/>
              </svg>
            </div>
            ${distanceLabel ? `<span class="vaango-map-shop-marker__dist">${distanceLabel}</span>` : ''}
          </div>
        `,
        iconSize: [36, 44],
        iconAnchor: [18, 42],
        popupAnchor: [0, -40],
      });

      const marker = L.marker(latLng, { icon: shopIcon, title: shop.name });

      // Build Accessible HTML Popup Preview
      const popupHtml = `
        <div class="vaango-map-popup">
          ${shop.photo_url ? `<img src="${shop.photo_url}" alt="${shop.name}" class="vaango-map-popup__img" />` : ''}
          <div class="vaango-map-popup__content">
            <div class="vaango-map-popup__header">
              <strong class="vaango-map-popup__title">${shop.name}</strong>
              ${distanceLabel ? `<span class="vaango-map-popup__dist">${distanceLabel}</span>` : ''}
            </div>
            ${shop.tagline ? `<p class="vaango-map-popup__tagline">${shop.tagline}</p>` : ''}
            <div class="vaango-map-popup__meta">
              <span class="vaango-map-popup__status ${shop.is_open_today ? 'vaango-map-popup__status--open' : 'vaango-map-popup__status--closed'}">
                ${shop.is_open_today ? 'Open Today' : 'Closed'}
              </span>
              ${shop.avg_rating != null ? `<span class="vaango-map-popup__rating">★ ${shop.avg_rating}</span>` : ''}
            </div>
            <p class="vaango-map-popup__address">${shop.address_line || ''}</p>
            <div class="vaango-map-popup__actions">
              <button type="button" class="vaango-map-popup__btn" data-shop-id="${shop.id}">
                <span>View Shop</span>
              </button>
              <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noopener noreferrer" class="vaango-map-popup__link" title="Open Google Maps">
                <span>Directions</span>
              </a>
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 280, minWidth: 220, className: 'vaango-custom-leaflet-popup' });

      marker.on('click', () => {
        if (onSelectShop) onSelectShop(shop);
      });

      marker.addTo(markersGroup);
    });

    // Auto-fit bounds safely
    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), {
        padding: [45, 45],
        maxZoom: 16,
      });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 15);
    } else if (customerCoords) {
      map.setView([customerCoords.lat, customerCoords.lng], 14);
    }
  }, [validShops, customerCoords, selectedShopId, radiusMeters, onSelectShop]);

  // Handle click on "View Shop" button inside Leaflet popups
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handlePopupClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('.vaango-map-popup__btn') as HTMLButtonElement | null;
      if (button && button.dataset.shopId) {
        navigate(`/shop/${button.dataset.shopId}`);
      }
    };

    container.addEventListener('click', handlePopupClick);
    return () => {
      container.removeEventListener('click', handlePopupClick);
    };
  }, [navigate]);

  // Recenter map on customer location
  const handleRecenterCustomer = useCallback(() => {
    if (!mapInstanceRef.current || !customerCoords) return;
    mapInstanceRef.current.flyTo([customerCoords.lat, customerCoords.lng], 15, {
      duration: 1.2,
    });
  }, [customerCoords]);

  if (isTownMapUnavailable) {
    return (
      <div className="vaango-map-fallback-box" role="alert">
        <AlertTriangle size={32} className="vaango-map-fallback-icon" />
        <h4 style={{ margin: '6px 0', color: 'var(--color-text-primary)' }}>
          Map location unavailable for {selectedLocationName || 'this town'}
        </h4>
        <p style={{ margin: 0, fontSize: '13px', maxWidth: '360px' }}>
          Town geographic center is not yet configured for {selectedLocationName || 'this area'}. Please use the List view to browse shops.
        </p>
        {onSwitchToList && (
          <button
            type="button"
            className="vaango-map-popup__btn"
            style={{ marginTop: '12px', maxWidth: '180px' }}
            onClick={onSwitchToList}
          >
            Switch to List View
          </button>
        )}
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="vaango-map-fallback-box" role="alert">
        <AlertTriangle size={24} className="vaango-map-fallback-icon" />
        <p>{mapError}</p>
      </div>
    );
  }

  return (
    <div className="vaango-customer-map-wrapper" role="region" aria-label="Interactive Map of Shops">
      <div ref={mapContainerRef} className="vaango-customer-map" />

      {/* Recenter Button on Customer Location */}
      {customerCoords && (
        <button
          type="button"
          className="vaango-map-recenter-btn"
          onClick={handleRecenterCustomer}
          title="Recenter on your location"
          aria-label="Recenter map on your location"
        >
          <Navigation size={16} />
          <span>My Location</span>
        </button>
      )}

      {/* Map Legend Banner */}
      <div className="vaango-map-info-bar">
        <div className="vaango-map-info-item">
          <span className="vaango-map-legend-dot vaango-map-legend-dot--customer" />
          <span>You</span>
        </div>
        <div className="vaango-map-info-item">
          <span className="vaango-map-legend-dot vaango-map-legend-dot--shop" />
          <span>{validShops.length} {validShops.length === 1 ? 'Shop' : 'Shops'}</span>
        </div>
        {radiusMeters && customerCoords && (
          <div className="vaango-map-info-item">
            <span>Radius: {formatDistance(radiusMeters)}</span>
          </div>
        )}
      </div>

      {/* Notice if some shops lacked GPS coordinates */}
      {shops.length > validShops.length && (
        <div className="vaango-map-unlocated-notice">
          <Store size={13} />
          <span>
            {shops.length - validShops.length} {shops.length - validShops.length === 1 ? 'shop has' : 'shops have'} no GPS coordinates set and appear in List view.
          </span>
        </div>
      )}
    </div>
  );
};
