/**
 * Campuses users can belong to. Keep this list small and editable: add an entry,
 * restart the server, and it appears in the sign-up picker and campus search.
 *
 *   id            stable id stored on users (never rename one that is in use)
 *   center        campus centre, decimal degrees
 *   radiusMeters  "on campus" radius for location sharing. Campuses aren't circles,
 *                 so each radius is a bit larger than the circle of the same area.
 *
 * Coordinates and areas are from each institute's Wikipedia infobox (checked 2026-10-09):
 *   IIT Mandi    https://en.wikipedia.org/wiki/Indian_Institute_of_Technology_Mandi    31°46′18″N 76°59′01″E, 538 acres
 *   IIT Delhi    https://en.wikipedia.org/wiki/Indian_Institute_of_Technology_Delhi    28°32′42″N 77°11′32″E, ~325 acres
 *   IIT Bombay   https://en.wikipedia.org/wiki/Indian_Institute_of_Technology_Bombay   19°08′01″N 72°54′55″E, 545 acres
 *   IIT Roorkee  https://en.wikipedia.org/wiki/Indian_Institute_of_Technology_Roorkee  29°51′52″N 77°53′47″E, 365 acres
 */
export const CAMPUSES = Object.freeze([
  {
    id: 'iit-mandi',
    name: 'IIT Mandi (Kamand campus)',
    shortName: 'IIT Mandi',
    city: 'Kamand, Himachal Pradesh',
    center: { lat: 31.77167, lng: 76.98361 },
    // 538 acres ≈ 2.2 km², spread along the Uhl valley (north and south campus).
    radiusMeters: 1500,
  },
  {
    id: 'iit-delhi',
    name: 'IIT Delhi (Hauz Khas campus)',
    shortName: 'IIT Delhi',
    city: 'New Delhi',
    center: { lat: 28.545, lng: 77.19222 },
    radiusMeters: 900,
  },
  {
    id: 'iit-bombay',
    name: 'IIT Bombay (Powai campus)',
    shortName: 'IIT Bombay',
    city: 'Mumbai, Maharashtra',
    center: { lat: 19.13364, lng: 72.91536 },
    radiusMeters: 1100,
  },
  {
    id: 'iit-roorkee',
    name: 'IIT Roorkee (main campus)',
    shortName: 'IIT Roorkee',
    city: 'Roorkee, Uttarakhand',
    center: { lat: 29.86444, lng: 77.89639 },
    radiusMeters: 1000,
  },
]);

const byId = new Map(CAMPUSES.map((c) => [c.id, c]));

export const getCampus = (id) => (typeof id === 'string' ? byId.get(id) ?? null : null);
export const isCampusId = (id) => Boolean(getCampus(id));

/** What GET /api/campuses returns (no geometry: location checks happen on the server). */
export const publicCampus = ({ id, name, shortName, city }) => ({ id, name, shortName, city });
