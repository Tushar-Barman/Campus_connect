import { useEffect, useState } from 'react';
import { campusesApi } from './api.js';

// Used until GET /api/campuses answers, and in mock mode (the mock server has no campus list).
// Keep in step with server/src/config/campuses.js; the server list wins when it loads.
const FALLBACK = [
  { id: 'iit-mandi', name: 'IIT Mandi (Kamand campus)', shortName: 'IIT Mandi', city: 'Kamand, Himachal Pradesh', center: { lat: 31.77167, lng: 76.98361 }, radiusMeters: 1500 },
  { id: 'iit-bhilai', name: 'IIT Bhilai', shortName: 'IIT Bhilai', city: 'Durg, Chhattisgarh', center: { lat: 21.24463, lng: 81.31831 }, radiusMeters: 1000 },
  { id: 'iit-bhubaneswar', name: 'IIT Bhubaneswar (Argul campus)', shortName: 'IIT Bhubaneswar', city: 'Khordha, Odisha', center: { lat: 20.14789, lng: 85.67597 }, radiusMeters: 1500 },
  { id: 'iit-bhu', name: 'IIT (BHU) Varanasi', shortName: 'IIT BHU', city: 'Varanasi, Uttar Pradesh', center: { lat: 25.26861, lng: 82.99028 }, radiusMeters: 1000 },
  { id: 'iit-bombay', name: 'IIT Bombay (Powai campus)', shortName: 'IIT Bombay', city: 'Mumbai, Maharashtra', center: { lat: 19.13364, lng: 72.91536 }, radiusMeters: 1100 },
  { id: 'iit-delhi', name: 'IIT Delhi (Hauz Khas campus)', shortName: 'IIT Delhi', city: 'New Delhi', center: { lat: 28.545, lng: 77.19222 }, radiusMeters: 900 },
  { id: 'iit-ism', name: 'IIT (ISM) Dhanbad', shortName: 'IIT ISM Dhanbad', city: 'Dhanbad, Jharkhand', center: { lat: 23.8133, lng: 86.4419 }, radiusMeters: 700 },
  { id: 'iit-dharwad', name: 'IIT Dharwad', shortName: 'IIT Dharwad', city: 'Dharwad, Karnataka', center: { lat: 15.48735, lng: 74.93453 }, radiusMeters: 1100 },
  { id: 'iit-gandhinagar', name: 'IIT Gandhinagar (Palaj campus)', shortName: 'IIT Gandhinagar', city: 'Gandhinagar, Gujarat', center: { lat: 23.21142, lng: 72.68206 }, radiusMeters: 1000 },
  { id: 'iit-goa', name: 'IIT Goa (Farmagudi campus)', shortName: 'IIT Goa', city: 'Ponda, Goa', center: { lat: 15.42329, lng: 73.97893 }, radiusMeters: 600 },
  { id: 'iit-guwahati', name: 'IIT Guwahati', shortName: 'IIT Guwahati', city: 'North Guwahati, Assam', center: { lat: 26.19248, lng: 91.69464 }, radiusMeters: 1300 },
  { id: 'iit-hyderabad', name: 'IIT Hyderabad (Kandi campus)', shortName: 'IIT Hyderabad', city: 'Sangareddy, Telangana', center: { lat: 17.59619, lng: 78.12524 }, radiusMeters: 1200 },
  { id: 'iit-indore', name: 'IIT Indore (Simrol campus)', shortName: 'IIT Indore', city: 'Indore, Madhya Pradesh', center: { lat: 22.526, lng: 75.923 }, radiusMeters: 1100 },
  { id: 'iit-jammu', name: 'IIT Jammu', shortName: 'IIT Jammu', city: 'Jammu, Jammu and Kashmir', center: { lat: 32.80369, lng: 74.89585 }, radiusMeters: 1000 },
  { id: 'iit-jodhpur', name: 'IIT Jodhpur', shortName: 'IIT Jodhpur', city: 'Jodhpur, Rajasthan', center: { lat: 26.475, lng: 73.115 }, radiusMeters: 1400 },
  { id: 'iit-kanpur', name: 'IIT Kanpur', shortName: 'IIT Kanpur', city: 'Kanpur, Uttar Pradesh', center: { lat: 26.51138, lng: 80.23493 }, radiusMeters: 1600 },
  { id: 'iit-kharagpur', name: 'IIT Kharagpur', shortName: 'IIT Kharagpur', city: 'Kharagpur, West Bengal', center: { lat: 22.31971, lng: 87.30996 }, radiusMeters: 2200 },
  { id: 'iit-madras', name: 'IIT Madras', shortName: 'IIT Madras', city: 'Chennai, Tamil Nadu', center: { lat: 12.99151, lng: 80.23362 }, radiusMeters: 1200 },
  { id: 'iit-palakkad', name: 'IIT Palakkad', shortName: 'IIT Palakkad', city: 'Palakkad, Kerala', center: { lat: 10.79389, lng: 76.82667 }, radiusMeters: 1100 },
  { id: 'iit-patna', name: 'IIT Patna (Bihta campus)', shortName: 'IIT Patna', city: 'Bihta, Bihar', center: { lat: 25.54244, lng: 84.85161 }, radiusMeters: 1100 },
  { id: 'iit-ropar', name: 'IIT Ropar', shortName: 'IIT Ropar', city: 'Rupnagar, Punjab', center: { lat: 30.97157, lng: 76.4732 }, radiusMeters: 1100 },
  { id: 'iit-roorkee', name: 'IIT Roorkee (main campus)', shortName: 'IIT Roorkee', city: 'Roorkee, Uttarakhand', center: { lat: 29.86444, lng: 77.89639 }, radiusMeters: 1000 },
  { id: 'iit-tirupati', name: 'IIT Tirupati', shortName: 'IIT Tirupati', city: 'Tirupati, Andhra Pradesh', center: { lat: 13.71444, lng: 79.59528 }, radiusMeters: 1100 },
];

let cache = null;
let pending = null;

function load() {
  pending ??= campusesApi
    .list()
    .then(({ campuses }) => {
      if (Array.isArray(campuses) && campuses.length) cache = campuses;
      return cache ?? FALLBACK;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** → { campuses, loading }. Fetched once per page load and shared. */
export function useCampuses() {
  const [campuses, setCampuses] = useState(cache ?? FALLBACK);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    load().then((list) => {
      if (!alive) return;
      setCampuses(list);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return { campuses, loading };
}

export function findCampus(campuses, id) {
  return campuses.find((c) => c.id === id) ?? null;
}

/** "IIT Mandi" for an id, or the id itself if the list doesn't know it. */
export function campusLabel(campuses, id) {
  return findCampus(campuses, id)?.shortName ?? id ?? '';
}
