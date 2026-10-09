// Same maths as server/src/utils/geo.js. The client only uses it for the "On campus" hint
// before sending; the server recomputes onCampus from the sender's campus.
const EARTH_RADIUS_M = 6_371_000;
const rad = (deg) => (deg * Math.PI) / 180;

export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const isOnCampus = (campus, point) =>
  Boolean(campus?.center && campus.radiusMeters) && distanceMeters(campus.center, point) <= campus.radiusMeters;

export const LOW_ACCURACY_M = 100;

/** OpenStreetMap embed (no API key). `span` is half the box size in degrees. */
export function osmEmbedUrl({ lat, lng }, span = 0.004) {
  const bbox = [lng - span, lat - span, lng + span, lat + span].map((n) => n.toFixed(6)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export const directionsUrl = ({ lat, lng }) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
export const openInMapsUrl = ({ lat, lng }) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** "±12 m", "±1.2 km" */
export function formatAccuracy(meters) {
  const m = Math.round(Number(meters) || 0);
  return m < 1000 ? `±${m} m` : `±${(m / 1000).toFixed(1)} km`;
}

/** A pending request older than 10 minutes is expired (same rule as the server). */
export const LOCATION_REQUEST_TTL_MS = 10 * 60 * 1000;
export function requestStatusOf(message, now = Date.now()) {
  const status = message.requestStatus || 'pending';
  if (status === 'pending' && now - new Date(message.createdAt).getTime() > LOCATION_REQUEST_TTL_MS) return 'expired';
  return status;
}
