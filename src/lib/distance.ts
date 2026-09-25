/**
 * Distance formatting and offline fallback calculation utilities for Vaangly GIS.
 */

/**
 * Formats distance in meters into customer-friendly localized text:
 * - < 1000m: "350 m"
 * - >= 1000m: "1.2 km"
 *
 * Every displayed distance comes from real PostGIS distance_meters (or offline demo fallback).
 */
export function formatDistance(distanceMeters: number | null | undefined): string {
  if (distanceMeters == null || isNaN(distanceMeters) || distanceMeters < 0) {
    return '';
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  const km = distanceMeters / 1000;
  // Format to 1 decimal place, e.g. 1.2 km, 5.0 km
  return `${km.toFixed(1)} km`;
}

/**
 * Calculates Great-Circle distance between two points using the Haversine formula.
 * Returns distance in meters.
 * NOTE: Used ONLY for offline/demo fallback when Supabase PostGIS is not connected.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
