import { useEffect, useState } from 'react';
import { campusesApi } from './api.js';

// Used until GET /api/campuses answers, and in mock mode (the mock server has no campus list).
// Keep in step with server/src/config/campuses.js; the server list wins when it loads.
const FALLBACK = [
  { id: 'iit-mandi', name: 'IIT Mandi (Kamand campus)', shortName: 'IIT Mandi', city: 'Kamand, Himachal Pradesh' },
  { id: 'iit-bhilai', name: 'IIT Bhilai', shortName: 'IIT Bhilai', city: 'Durg, Chhattisgarh' },
  { id: 'iit-bhubaneswar', name: 'IIT Bhubaneswar (Argul campus)', shortName: 'IIT Bhubaneswar', city: 'Khordha, Odisha' },
  { id: 'iit-bhu', name: 'IIT (BHU) Varanasi', shortName: 'IIT BHU', city: 'Varanasi, Uttar Pradesh' },
  { id: 'iit-bombay', name: 'IIT Bombay (Powai campus)', shortName: 'IIT Bombay', city: 'Mumbai, Maharashtra' },
  { id: 'iit-delhi', name: 'IIT Delhi (Hauz Khas campus)', shortName: 'IIT Delhi', city: 'New Delhi' },
  { id: 'iit-ism', name: 'IIT (ISM) Dhanbad', shortName: 'IIT ISM Dhanbad', city: 'Dhanbad, Jharkhand' },
  { id: 'iit-dharwad', name: 'IIT Dharwad', shortName: 'IIT Dharwad', city: 'Dharwad, Karnataka' },
  { id: 'iit-gandhinagar', name: 'IIT Gandhinagar (Palaj campus)', shortName: 'IIT Gandhinagar', city: 'Gandhinagar, Gujarat' },
  { id: 'iit-goa', name: 'IIT Goa (Farmagudi campus)', shortName: 'IIT Goa', city: 'Ponda, Goa' },
  { id: 'iit-guwahati', name: 'IIT Guwahati', shortName: 'IIT Guwahati', city: 'North Guwahati, Assam' },
  { id: 'iit-hyderabad', name: 'IIT Hyderabad (Kandi campus)', shortName: 'IIT Hyderabad', city: 'Sangareddy, Telangana' },
  { id: 'iit-indore', name: 'IIT Indore (Simrol campus)', shortName: 'IIT Indore', city: 'Indore, Madhya Pradesh' },
  { id: 'iit-jammu', name: 'IIT Jammu', shortName: 'IIT Jammu', city: 'Jammu, Jammu and Kashmir' },
  { id: 'iit-jodhpur', name: 'IIT Jodhpur', shortName: 'IIT Jodhpur', city: 'Jodhpur, Rajasthan' },
  { id: 'iit-kanpur', name: 'IIT Kanpur', shortName: 'IIT Kanpur', city: 'Kanpur, Uttar Pradesh' },
  { id: 'iit-kharagpur', name: 'IIT Kharagpur', shortName: 'IIT Kharagpur', city: 'Kharagpur, West Bengal' },
  { id: 'iit-madras', name: 'IIT Madras', shortName: 'IIT Madras', city: 'Chennai, Tamil Nadu' },
  { id: 'iit-palakkad', name: 'IIT Palakkad', shortName: 'IIT Palakkad', city: 'Palakkad, Kerala' },
  { id: 'iit-patna', name: 'IIT Patna (Bihta campus)', shortName: 'IIT Patna', city: 'Bihta, Bihar' },
  { id: 'iit-ropar', name: 'IIT Ropar', shortName: 'IIT Ropar', city: 'Rupnagar, Punjab' },
  { id: 'iit-roorkee', name: 'IIT Roorkee (main campus)', shortName: 'IIT Roorkee', city: 'Roorkee, Uttarakhand' },
  { id: 'iit-tirupati', name: 'IIT Tirupati', shortName: 'IIT Tirupati', city: 'Tirupati, Andhra Pradesh' },
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
