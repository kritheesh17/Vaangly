/**
 * Centralized Map Provider and Tile Layer Configuration for Vaangly GIS.
 * Supports light/dark mode tiles and avoids hardcoding tile endpoints in UI components.
 */

export interface TileLayerConfig {
  url: string;
  attribution: string;
  maxZoom: number;
  minZoom: number;
  subdomains: string[];
}

export const MAP_CONFIG = {
  defaultZoom: 14,
  minZoom: 5,
  maxZoom: 19,
  lightTiles: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    minZoom: 4,
    subdomains: ['a', 'b', 'c', 'd'],
  },
  darkTiles: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    minZoom: 4,
    subdomains: ['a', 'b', 'c', 'd'],
  },
  fallbackOsmTiles: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    minZoom: 4,
    subdomains: ['a', 'b', 'c'],
  },
};

/**
 * Returns appropriate tile configuration based on active dark/light theme.
 */
export function getTileLayerConfig(isDark: boolean): TileLayerConfig {
  return isDark ? MAP_CONFIG.darkTiles : MAP_CONFIG.lightTiles;
}
