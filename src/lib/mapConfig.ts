/**
 * Centralized Map Provider and Tile Layer Configuration for Vaangly GIS.
 * Provides keyless, open-standards OpenStreetMap raster tiles by default,
 * completely avoiding any "API KEY REQUIRED" raster watermark errors.
 * 
 * Supports optional CARTO endpoints if an explicit API key is configured.
 */
import L from 'leaflet';

export interface TileLayerConfig {
  url: string;
  attribution: string;
  maxZoom: number;
  minZoom: number;
  subdomains: string[];
  className?: string;
}

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const CARTO_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>';

// Optional CARTO key check — Vaangly operates 100% keylessly by default using OpenStreetMap
const CARTO_KEY = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_CARTO_API_KEY as string | undefined) : undefined;

export const MAP_CONFIG = {
  defaultZoom: 14,
  minZoom: 4,
  maxZoom: 19,
  // Primary default keyless OpenStreetMap configuration
  osmTiles: {
    url: OSM_TILE_URL,
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    minZoom: 4,
    subdomains: ['a', 'b', 'c'],
  } as TileLayerConfig,
  // Fallback alias for backward compatibility and tile recovery
  fallbackOsmTiles: {
    url: OSM_TILE_URL,
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    minZoom: 4,
    subdomains: ['a', 'b', 'c'],
  } as TileLayerConfig,
  // Light tiles: Keyless OpenStreetMap by default (or CARTO voyager if key is provided)
  lightTiles: {
    url: CARTO_KEY
      ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?api_key=${CARTO_KEY}`
      : OSM_TILE_URL,
    attribution: CARTO_KEY ? CARTO_ATTRIBUTION : OSM_ATTRIBUTION,
    maxZoom: 19,
    minZoom: 4,
    subdomains: CARTO_KEY ? ['a', 'b', 'c', 'd'] : ['a', 'b', 'c'],
  } as TileLayerConfig,
  // Dark tiles: Keyless OpenStreetMap with CSS dark filter by default (or CARTO dark_all if key is provided)
  darkTiles: {
    url: CARTO_KEY
      ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${CARTO_KEY}`
      : OSM_TILE_URL,
    attribution: CARTO_KEY ? CARTO_ATTRIBUTION : OSM_ATTRIBUTION,
    maxZoom: 19,
    minZoom: 4,
    subdomains: CARTO_KEY ? ['a', 'b', 'c', 'd'] : ['a', 'b', 'c'],
    className: CARTO_KEY ? undefined : 'vaango-map-tiles--dark',
  } as TileLayerConfig,
};

/**
 * Returns the active tile configuration based on light/dark mode.
 * Defaults to keyless OpenStreetMap tiles when no CARTO API key is provided.
 */
export function getTileLayerConfig(isDark: boolean): TileLayerConfig {
  return isDark ? MAP_CONFIG.darkTiles : MAP_CONFIG.lightTiles;
}

/**
 * Factory to create a robust Leaflet TileLayer with automatic error fallback.
 * If any tile error occurs, it automatically falls back to standard OpenStreetMap
 * tiles without entering an infinite retry loop.
 */
export function createTileLayer(isDark: boolean, options?: L.TileLayerOptions): L.TileLayer {
  const cfg = getTileLayerConfig(isDark);
  const layer = L.tileLayer(cfg.url, {
    attribution: cfg.attribution,
    maxZoom: cfg.maxZoom,
    minZoom: cfg.minZoom,
    subdomains: cfg.subdomains,
    className: cfg.className,
    ...options,
  });

  let hasFallenBack = false;
  layer.on('tileerror', () => {
    if (!hasFallenBack && cfg.url !== MAP_CONFIG.fallbackOsmTiles.url) {
      hasFallenBack = true;
      console.warn('Map tile failed to load. Falling back to OpenStreetMap standard tiles.');
      layer.setUrl(MAP_CONFIG.fallbackOsmTiles.url);
    }
  });

  return layer;
}
