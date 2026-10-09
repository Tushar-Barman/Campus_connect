import { useEffect, useState } from 'react';
import { campusesApi } from './api.js';

// Used until GET /api/campuses answers, and in mock mode (the mock server has no campus list).
// Keep in step with server/src/config/campuses.js; the server list wins when it loads.
const FALLBACK = [
  { id: 'iit-mandi', name: 'IIT Mandi (Kamand campus)', shortName: 'IIT Mandi', city: 'Kamand, Himachal Pradesh' },
  { id: 'iit-delhi', name: 'IIT Delhi (Hauz Khas campus)', shortName: 'IIT Delhi', city: 'New Delhi' },
  { id: 'iit-bombay', name: 'IIT Bombay (Powai campus)', shortName: 'IIT Bombay', city: 'Mumbai, Maharashtra' },
  { id: 'iit-roorkee', name: 'IIT Roorkee (main campus)', shortName: 'IIT Roorkee', city: 'Roorkee, Uttarakhand' },
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
