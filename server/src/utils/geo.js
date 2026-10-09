const EARTH_RADIUS_M = 6_371_000;
const rad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two { lat, lng } points (haversine). */
export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True if the point is inside the campus radius. `campus` comes from config/campuses.js. */
export function isOnCampus(campus, point) {
  if (!campus?.center || !campus.radiusMeters) return false;
  return distanceMeters(campus.center, point) <= campus.radiusMeters;
}
