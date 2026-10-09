// STAND-IN for P3's hooks/useVoiceRecorder.js
// useVoiceRecorder(onRecorded) → { isSupported, isRecording, elapsedMs, maxDurationMs, error, holdProps }
// Hold to record, release to send, slide away (> 120 px) to cancel. Keyboard: hold Space/Enter.
import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_MS = 120000;
const MIN_MS = 700;
const CANCEL_PX = 120;
const MIME_PREFS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const ERRORS = {
  NotAllowedError: 'Microphone access is blocked. Allow it in your browser’s site settings and try again.',
  SecurityError: 'Microphone access is blocked. Allow it in your browser’s site settings and try again.',
  NotFoundError: 'No microphone was found on this device.',
  NotReadableError: 'Your microphone is being used by another app.',
};

const supported = () =>
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

export function useVoiceRecorder(onRecorded) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState('');
  const r = useRef({ recorder: null, stream: null, chunks: [], startedAt: 0, timer: null, pressed: false, origin: null });
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const cleanup = useCallback(() => {
    const s = r.current;
    clearInterval(s.timer);
    s.stream?.getTracks().forEach((t) => t.stop());
    Object.assign(s, { recorder: null, stream: null, chunks: [], timer: null });
    setIsRecording(false);
    setElapsedMs(0);
  }, []);

  const cancel = useCallback(() => {
    const s = r.current;
    s.pressed = false;
    if (s.recorder && s.recorder.state !== 'inactive') {
      s.recorder.onstop = cleanup;
      s.recorder.stop();
    } else cleanup();
  }, [cleanup]);

  const finish = useCallback(() => {
    const s = r.current;
    s.pressed = false;
    const recorder = s.recorder;
    if (!recorder || recorder.state === 'inactive') {
      setError('Hold the button to record a voice note.'); // released before the mic was ready
      cleanup();
      return;
    }
    const durationMs = Math.min(Date.now() - s.startedAt, MAX_MS);
    if (durationMs < MIN_MS) {
      setError('Hold the button to record a voice note.');
      cancel();
      return;
    }
    recorder.onstop = () => {
      const mimeType = (recorder.mimeType || s.chunks[0]?.type || 'audio/webm').split(';')[0];
      const blob = new Blob(s.chunks, { type: mimeType });
      cleanup();
      onRecordedRef.current?.({ blob, duration: durationMs / 1000, durationMs, mimeType });
    };
    recorder.stop();
  }, [cancel, cleanup]);

  const start = useCallback(async () => {
    setError('');
    if (!supported()) {
      setError('Voice recording is not supported in this browser.');
      return;
    }
    const s = r.current;
    s.pressed = true;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      s.pressed = false;
      setError(ERRORS[err?.name] || 'Could not start the microphone.');
      return;
    }
    if (!s.pressed) {
      stream.getTracks().forEach((t) => t.stop()); // released before the mic was ready
      return;
    }
    const mimeType = MIME_PREFS.find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
    recorder.ondataavailable = (e) => e.data?.size && s.chunks.push(e.data);
    Object.assign(s, { recorder, stream, chunks: [], startedAt: Date.now() });
    recorder.start(250);
    setIsRecording(true);
    s.timer = setInterval(() => {
      const ms = Date.now() - s.startedAt;
      setElapsedMs(ms);
      if (ms >= MAX_MS) finish();
    }, 200);
  }, [finish]);

  useEffect(() => () => cancel(), [cancel]);

  const holdProps = {
    onPointerDown: (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      r.current.origin = { x: e.clientX, y: e.clientY };
      start();
    },
    onPointerUp: (e) => {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      if (r.current.pressed) finish();
    },
    onPointerMove: (e) => {
      const o = r.current.origin;
      if (!r.current.pressed || !o) return;
      if (Math.hypot(e.clientX - o.x, e.clientY - o.y) > CANCEL_PX) {
        cancel();
        setError('Voice note cancelled.');
      }
    },
    onPointerCancel: () => cancel(),
    onKeyDown: (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        start();
      } else if (e.key === 'Escape') cancel();
    },
    onKeyUp: (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (r.current.pressed) finish();
      }
    },
    onContextMenu: (e) => e.preventDefault(),
  };

  return { isSupported: supported(), isRecording, elapsedMs, maxDurationMs: MAX_MS, error, holdProps };
}

export default useVoiceRecorder;
