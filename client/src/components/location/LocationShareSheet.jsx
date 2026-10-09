import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, LocateFixed, MapPin, RefreshCw, SendHorizontal, ShieldCheck } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import { Alert, Spinner } from '../ui/Feedback.jsx';
import { getErrorMessage } from '../../lib/api.js';
import { formatAccuracy, isOnCampus, LOW_ACCURACY_M, osmEmbedUrl } from '../../lib/geo.js';

const EXPLAINED_KEY = 'cc_location_explained';
const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
const LABEL_MAX = 60;

const storage = {
  seen() {
    try {
      return localStorage.getItem(EXPLAINED_KEY) === '1';
    } catch {
      return false;
    }
  },
  markSeen() {
    try {
      localStorage.setItem(EXPLAINED_KEY, '1');
    } catch {
      /* fine: the explainer just shows again next time */
    }
  },
};

function geoErrorText(error) {
  if (error?.code === 1) {
    return 'Location access is blocked for this site. Allow it in your browser (the icon next to the address bar → Site settings → Location), then try again.';
  }
  if (error?.code === 3) return 'Finding your location took too long. Move near a window or outdoors and try again.';
  return "Your device couldn't find your location. Check that location services are on, then try again.";
}

function VerificationLine({ coords, campus }) {
  if (coords.accuracy > LOW_ACCURACY_M) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-ink">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Low accuracy ({formatAccuracy(coords.accuracy)}). Move to open sky and press Refresh.
      </p>
    );
  }
  if (!campus) return null;
  return isOnCampus(campus, coords) ? (
    <p className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      On campus ({campus.shortName})
    </p>
  ) : (
    <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning-ink">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      You appear to be outside {campus.shortName}. You can still send it.
    </p>
  );
}

/**
 * Round 2, Flow A: explain → ask the browser → confirm on a map → Send.
 * Nothing is sent until the user presses Send. onSend({ lat, lng, accuracy, label }) may reject.
 * `campus` is the user's campus (with center/radiusMeters) for the on-campus hint.
 */
export default function LocationShareSheet({ open, onClose, onSend, campus, title = 'Share your location', intro }) {
  const [step, setStep] = useState('explain'); // explain | locating | ready | error
  const [coords, setCoords] = useState(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const runRef = useRef(0);

  const locate = useCallback(() => {
    if (!window.isSecureContext) {
      setError('Location only works on a secure (https) page.');
      setStep('error');
      return;
    }
    if (!('geolocation' in navigator)) {
      setError("This browser can't share your location.");
      setStep('error');
      return;
    }
    const run = ++runRef.current;
    setStep('locating');
    setError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => {
        if (run !== runRef.current) return;
        setCoords({ lat: c.latitude, lng: c.longitude, accuracy: Math.min(Math.round(c.accuracy), 5000) });
        setStep('ready');
      },
      (err) => {
        if (run !== runRef.current) return;
        setError(geoErrorText(err));
        setStep('error');
      },
      GEO_OPTIONS,
    );
  }, []);

  // Each time the sheet opens: explainer the first time, otherwise straight to locating.
  useEffect(() => {
    if (!open) {
      runRef.current += 1; // ignore a late answer from the browser
      return;
    }
    setCoords(null);
    setLabel('');
    setSendError('');
    if (storage.seen()) locate();
    else setStep('explain');
  }, [open, locate]);

  const send = async () => {
    if (!coords || sending) return;
    setSending(true);
    setSendError('');
    try {
      await onSend({ ...coords, label: label.trim() });
      onClose();
    } catch (err) {
      setSendError(getErrorMessage(err, 'Could not send your location.'));
    } finally {
      setSending(false);
    }
  };

  let footer = null;
  if (step === 'explain') {
    footer = (
      <>
        <Button variant="secondary" onClick={onClose}>
          Not now
        </Button>
        <Button
          onClick={() => {
            storage.markSeen();
            locate();
          }}
        >
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
          Find my location
        </Button>
      </>
    );
  } else if (step === 'ready') {
    footer = (
      <>
        <Button variant="secondary" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={locate} disabled={sending}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
        <Button onClick={send} loading={sending}>
          {sending ? null : <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
          Send
        </Button>
      </>
    );
  } else if (step === 'error') {
    footer = (
      <>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button onClick={locate}>Try again</Button>
      </>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} footer={footer}>
      {intro ? <p className="mb-3 text-sm text-ink-muted">{intro}</p> : null}

      {step === 'explain' ? (
        <div className="space-y-3 text-sm text-ink-muted">
          <p className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            Share where you are so classmates can find you on campus. Your browser will ask for permission.
          </p>
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            It's only sent when you press Send, only to this chat, and only once. It's never shared automatically, and you
            can delete it for everyone afterwards.
          </p>
        </div>
      ) : null}

      {step === 'locating' ? (
        <div className="flex flex-col items-center gap-3 py-10 text-sm text-ink-muted" role="status">
          <Spinner className="h-6 w-6" label="Finding your location" />
          Finding your location…
        </div>
      ) : null}

      {step === 'error' ? <Alert>{error}</Alert> : null}

      {step === 'ready' && coords ? (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border">
            <iframe
              title="Map preview of your location"
              src={osmEmbedUrl(coords)}
              className="block h-52 w-full"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
          <p className="text-xs text-ink-subtle">Accuracy {formatAccuracy(coords.accuracy)}</p>
          <VerificationLine coords={coords} campus={campus} />
          <Input
            label="Label (optional)"
            placeholder="e.g. Library, 2nd floor"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={LABEL_MAX}
          />
          {sendError ? <Alert>{sendError}</Alert> : null}
        </div>
      ) : null}
    </Modal>
  );
}
