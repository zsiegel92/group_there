"use client";

export const USE_PAID_MAPBOX = true;

export type MapPoint = {
  latitude: number;
  longitude: number;
  label: string;
  variant: "destination" | "origin";
};

export type Route = {
  coordinates: [number, number][]; // [lng, lat][] for GeoJSON
  color: string;
  label: string;
};

export const ROUTE_COLORS = [
  "#16a34a",
  "#ea580c",
  "#9333ea",
  "#0d9488",
  "#dc2626",
  "#2563eb",
  "#ca8a04",
  "#be185d",
];

export function computeBounds(points: MapPoint[]) {
  if (points.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }

  return { minLat, maxLat, minLng, maxLng };
}

export function computeInitialView(points: MapPoint[]) {
  const bounds = computeBounds(points);
  if (!bounds) return { latitude: 39.8283, longitude: -98.5795, zoom: 4 };

  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;

  if (points.length === 1) {
    return { latitude: centerLat, longitude: centerLng, zoom: 13 };
  }

  const latDiff = bounds.maxLat - bounds.minLat;
  const lngDiff = bounds.maxLng - bounds.minLng;
  const maxDiff = Math.max(latDiff, lngDiff);

  let zoom = 12;
  if (maxDiff > 10) zoom = 4;
  else if (maxDiff > 5) zoom = 5;
  else if (maxDiff > 2) zoom = 6;
  else if (maxDiff > 1) zoom = 7;
  else if (maxDiff > 0.5) zoom = 8;
  else if (maxDiff > 0.2) zoom = 9;
  else if (maxDiff > 0.1) zoom = 10;
  else if (maxDiff > 0.05) zoom = 11;

  return { latitude: centerLat, longitude: centerLng, zoom };
}

export function MapSkeleton() {
  return (
    <div className="h-[400px] bg-gray-100 rounded-lg animate-pulse flex items-center justify-center text-gray-400">
      Loading map...
    </div>
  );
}
