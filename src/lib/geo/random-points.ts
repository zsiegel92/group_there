/**
 * Generate a random point within a given radius of a center point.
 * Uses sqrt(random) for uniform distribution within the circle.
 */
export function randomPointInRadius(
  centerLat: number,
  centerLng: number,
  radiusMiles: number
) {
  const radiusKm = radiusMiles * 1.60934;
  // Earth's radius in km
  const earthRadiusKm = 6371;

  // Random angle and distance (sqrt for uniform distribution)
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.sqrt(Math.random()) * radiusKm;

  // Convert distance to degrees
  const latOffset = (distance / earthRadiusKm) * (180 / Math.PI);
  const lngOffset =
    (distance / (earthRadiusKm * Math.cos((centerLat * Math.PI) / 180))) *
    (180 / Math.PI);

  const lat = centerLat + latOffset * Math.sin(angle);
  const lng = centerLng + lngOffset * Math.cos(angle);

  return { latitude: lat, longitude: lng };
}
