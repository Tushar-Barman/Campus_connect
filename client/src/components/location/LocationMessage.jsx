import { useState } from 'react';
import { CheckCircle2, Clock, ExternalLink, MapPin, Navigation, XCircle } from 'lucide-react';
import { useNow } from '../../lib/useNow.js';
import { getErrorMessage } from '../../lib/api.js';
import { directionsUrl, formatAccuracy, LOCATION_REQUEST_TTL_MS, openInMapsUrl, osmEmbedUrl, requestStatusOf } from '../../lib/geo.js';

const linkClass = (mine) =>
  `inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
    mine ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
  }`;

/** Round 2: a shared location: map preview, label, accuracy, on-campus badge, directions. */
export function LocationBubble({ message, mine }) {
  const loc = message.location;
  if (!loc) return null;
  const point = { lat: loc.lat, lng: loc.lng };
  return (
    <div className="-mx-1.5 -mt-0.5 w-64 max-w-full">
      <div className="pointer-events-none overflow-hidden rounded-xl" aria-hidden="true">
        <iframe title="Shared location" src={osmEmbedUrl(point, 0.003)} className="block h-36 w-full" loading="lazy" tabIndex={-1} referrerPolicy="no-referrer" />
      </div>
      <div className="px-1.5 pt-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{loc.label || 'Shared location'}</span>
        </p>
        <p className={`mt-0.5 flex flex-wrap items-center gap-x-2 text-xs ${mine ? 'text-brand-100' : 'text-ink-subtle'}`}>
          <span>Accuracy {formatAccuracy(loc.accuracy)}</span>
          {loc.onCampus ? (
            <span className={`inline-flex items-center gap-0.5 font-semibold ${mine ? 'text-white' : 'text-success'}`}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> On campus
            </span>
          ) : null}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <a href={directionsUrl(point)} target="_blank" rel="noopener noreferrer" className={linkClass(mine)}>
            <Navigation className="h-3.5 w-3.5" aria-hidden="true" /> Get directions
          </a>
          <a href={openInMapsUrl(point)} target="_blank" rel="noopener noreferrer" className={linkClass(mine)}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open in Maps
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Round 2, Flow B: "Asha asked for your location" with Share / Decline for anyone but the requester.
 * Expiry is recomputed every 30 s, so the buttons disappear on time even without a server event.
 */
export function LocationRequestCard({ message, mine, onShare, onDecline, onJump }) {
  const now = useNow(30000);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState('');
  const status = requestStatusOf(message, now.getTime());
  const firstName = (message.senderId?.name || 'Someone').split(' ')[0];
  const minutesLeft = Math.max(1, Math.ceil((new Date(message.createdAt).getTime() + LOCATION_REQUEST_TTL_MS - now.getTime()) / 60000));

  const decline = async () => {
    setDeclining(true);
    setError('');
    try {
      await onDecline(message);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not decline.'));
    } finally {
      setDeclining(false);
    }
  };

  const muted = mine ? 'text-brand-100' : 'text-ink-subtle';
  let footer;
  if (status === 'pending' && !mine && onShare) {
    footer = (
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => onShare(message)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Share
        </button>
        <button type="button" onClick={decline} disabled={declining} className="inline-flex flex-1 items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-surface-muted disabled:opacity-60">
          {declining ? 'Declining…' : 'Decline'}
        </button>
      </div>
    );
  } else if (status === 'pending') {
    footer = (
      <p className={`mt-1 flex items-center gap-1 text-xs ${muted}`}>
        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Waiting for a reply · expires in {minutesLeft} min
      </p>
    );
  } else if (status === 'accepted') {
    footer = (
      <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${mine ? 'text-white' : 'text-success'}`}>
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Location shared
        {message.respondedWith && onJump ? (
          <button type="button" onClick={() => onJump(String(message.respondedWith))} className="ml-1 underline underline-offset-2">
            View
          </button>
        ) : null}
      </p>
    );
  } else {
    footer = (
      <p className={`mt-1 flex items-center gap-1 text-xs ${muted}`}>
        <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> {status === 'declined' ? 'Declined' : 'Request expired'}
      </p>
    );
  }

  return (
    <div className="min-w-48">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
        {mine ? 'You asked for a location' : `${firstName} asked for your location`}
      </p>
      {footer}
      {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : null}
    </div>
  );
}
