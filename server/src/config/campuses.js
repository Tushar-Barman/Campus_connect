/**
 * Campuses users can belong to: all 23 IITs. Keep this list editable: add an entry,
 * restart the server, and it appears in the sign-up picker and campus search.
 * Keep client/src/lib/campuses.js (FALLBACK) in step with the ids and names.
 *
 *   id            stable id stored on users (never rename one that is in use)
 *   center        campus centre, decimal degrees
 *   radiusMeters  "on campus" radius for location sharing. Campuses aren't circles, so
 *                 each radius is ~1.35× the radius of a circle with the campus's area
 *                 (min 600 m), rounded to 100 m.
 *
 * Sources (checked 2026-10-09). Coordinates and areas come from each institute's
 * Wikipedia infobox (https://en.wikipedia.org/wiki/Indian_Institute_of_Technology_<Name>),
 * except where marked [OSM]: there Wikipedia had no coordinates, or pointed at an old
 * temporary site, so the OpenStreetMap feature for the campus was used instead
 * (https://nominatim.openstreetmap.org, "Indian Institute of Technology <Name>").
 */
export const CAMPUSES = Object.freeze([
  // Kamand, 538 acres, spread along the Uhl valley (north + south campus), hence the larger radius.
  { id: 'iit-mandi', name: 'IIT Mandi (Kamand campus)', shortName: 'IIT Mandi', city: 'Kamand, Himachal Pradesh', center: { lat: 31.77167, lng: 76.98361 }, radiusMeters: 1500 },

  // 445 acres. [OSM] Wikipedia infobox has no coordinates; matches the Google Maps link it cites.
  { id: 'iit-bhilai', name: 'IIT Bhilai', shortName: 'IIT Bhilai', city: 'Durg, Chhattisgarh', center: { lat: 21.24463, lng: 81.31831 }, radiusMeters: 1000 },
  // 936 acres. [OSM] The infobox point is the old temporary site; this is the Argul campus.
  { id: 'iit-bhubaneswar', name: 'IIT Bhubaneswar (Argul campus)', shortName: 'IIT Bhubaneswar', city: 'Khordha, Odisha', center: { lat: 20.14789, lng: 85.67597 }, radiusMeters: 1500 },
  // 425 acres
  { id: 'iit-bhu', name: 'IIT (BHU) Varanasi', shortName: 'IIT BHU', city: 'Varanasi, Uttar Pradesh', center: { lat: 25.26861, lng: 82.99028 }, radiusMeters: 1000 },
  // 545 acres
  { id: 'iit-bombay', name: 'IIT Bombay (Powai campus)', shortName: 'IIT Bombay', city: 'Mumbai, Maharashtra', center: { lat: 19.13364, lng: 72.91536 }, radiusMeters: 1100 },
  // ~325 acres
  { id: 'iit-delhi', name: 'IIT Delhi (Hauz Khas campus)', shortName: 'IIT Delhi', city: 'New Delhi', center: { lat: 28.545, lng: 77.19222 }, radiusMeters: 900 },
  // 218-acre main campus
  { id: 'iit-ism', name: 'IIT (ISM) Dhanbad', shortName: 'IIT ISM Dhanbad', city: 'Dhanbad, Jharkhand', center: { lat: 23.8133, lng: 86.4419 }, radiusMeters: 700 },
  // 470 acres
  { id: 'iit-dharwad', name: 'IIT Dharwad', shortName: 'IIT Dharwad', city: 'Dharwad, Karnataka', center: { lat: 15.48735, lng: 74.93453 }, radiusMeters: 1100 },
  // 399 acres
  { id: 'iit-gandhinagar', name: 'IIT Gandhinagar (Palaj campus)', shortName: 'IIT Gandhinagar', city: 'Gandhinagar, Gujarat', center: { lat: 23.21142, lng: 72.68206 }, radiusMeters: 1000 },
  // Temporary campus at Farmagudi (Goa Engineering College), no permanent campus yet. [OSM]
  { id: 'iit-goa', name: 'IIT Goa (Farmagudi campus)', shortName: 'IIT Goa', city: 'Ponda, Goa', center: { lat: 15.42329, lng: 73.97893 }, radiusMeters: 600 },
  // 704 acres. [OSM] Wikipedia infobox has no coordinates.
  { id: 'iit-guwahati', name: 'IIT Guwahati', shortName: 'IIT Guwahati', city: 'North Guwahati, Assam', center: { lat: 26.19248, lng: 91.69464 }, radiusMeters: 1300 },
  // 576 acres (Kandi). Infobox point; agrees with OSM (17.5923, 78.1222).
  { id: 'iit-hyderabad', name: 'IIT Hyderabad (Kandi campus)', shortName: 'IIT Hyderabad', city: 'Sangareddy, Telangana', center: { lat: 17.59619, lng: 78.12524 }, radiusMeters: 1200 },
  // 501 acres
  { id: 'iit-indore', name: 'IIT Indore (Simrol campus)', shortName: 'IIT Indore', city: 'Indore, Madhya Pradesh', center: { lat: 22.526, lng: 75.923 }, radiusMeters: 1100 },
  // ~159 ha permanent campus site
  { id: 'iit-jammu', name: 'IIT Jammu', shortName: 'IIT Jammu', city: 'Jammu, Jammu and Kashmir', center: { lat: 32.80369, lng: 74.89585 }, radiusMeters: 1000 },
  // 852 acres
  { id: 'iit-jodhpur', name: 'IIT Jodhpur', shortName: 'IIT Jodhpur', city: 'Jodhpur, Rajasthan', center: { lat: 26.475, lng: 73.115 }, radiusMeters: 1400 },
  // 1,055 acres
  { id: 'iit-kanpur', name: 'IIT Kanpur', shortName: 'IIT Kanpur', city: 'Kanpur, Uttar Pradesh', center: { lat: 26.51138, lng: 80.23493 }, radiusMeters: 1600 },
  // ~2,100 acres
  { id: 'iit-kharagpur', name: 'IIT Kharagpur', shortName: 'IIT Kharagpur', city: 'Kharagpur, West Bengal', center: { lat: 22.31971, lng: 87.30996 }, radiusMeters: 2200 },
  // 620 acres
  { id: 'iit-madras', name: 'IIT Madras', shortName: 'IIT Madras', city: 'Chennai, Tamil Nadu', center: { lat: 12.99151, lng: 80.23362 }, radiusMeters: 1200 },
  // 504 acres
  { id: 'iit-palakkad', name: 'IIT Palakkad', shortName: 'IIT Palakkad', city: 'Palakkad, Kerala', center: { lat: 10.79389, lng: 76.82667 }, radiusMeters: 1100 },
  // 501 acres (Bihta). [OSM] Wikipedia infobox has no coordinates.
  { id: 'iit-patna', name: 'IIT Patna (Bihta campus)', shortName: 'IIT Patna', city: 'Bihta, Bihar', center: { lat: 25.54244, lng: 84.85161 }, radiusMeters: 1100 },
  // 525 acres
  { id: 'iit-ropar', name: 'IIT Ropar', shortName: 'IIT Ropar', city: 'Rupnagar, Punjab', center: { lat: 30.97157, lng: 76.4732 }, radiusMeters: 1100 },
  // 365 acres
  { id: 'iit-roorkee', name: 'IIT Roorkee (main campus)', shortName: 'IIT Roorkee', city: 'Roorkee, Uttarakhand', center: { lat: 29.86444, lng: 77.89639 }, radiusMeters: 1000 },
  // 540 acres (Yerpedu)
  { id: 'iit-tirupati', name: 'IIT Tirupati', shortName: 'IIT Tirupati', city: 'Tirupati, Andhra Pradesh', center: { lat: 13.71444, lng: 79.59528 }, radiusMeters: 1100 },
]);

const byId = new Map(CAMPUSES.map((c) => [c.id, c]));

export const getCampus = (id) => (typeof id === 'string' ? byId.get(id) ?? null : null);
export const isCampusId = (id) => Boolean(getCampus(id));

/** What GET /api/campuses returns (no geometry: location checks happen on the server). */
export const publicCampus = ({ id, name, shortName, city }) => ({ id, name, shortName, city });
