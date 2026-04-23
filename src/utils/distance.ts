/**
 * Geo Logic Constants
 */
export const MAX_FEED_FETCH = 50;
export const MAX_FEED_RETURN = 20;

/**
 * Calculates the Haversine distance between two points in kilometers.
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Validates if a delivery is within range (radius + buffer).
 */
export function isWithinDeliveryRange(
  userLat: number,
  userLng: number,
  sellerLat: number,
  sellerLng: number,
  radiusKm: number
): boolean {
  const distance = haversineDistance(userLat, userLng, sellerLat, sellerLng);
  return distance <= radiusKm;
}
