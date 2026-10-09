import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_DURATION_MS = 1000;
const MAX_DURATION_MS = 120_000;
// Opus/WebM for Chrome, Firefox and Edge; MP4/AAC for Safari.
const CANDIDATE_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export const isVoiceRecordingSupported = () =>
  typeof navigator !== 'undefined' &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof MediaRecorder !== 'undefined';

function pickMimeType() {
  return CANDIDATE_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function releaseResources(session) {
  clearInterval(session.ticker);
  clearTimeout(session.autoStop);
  session.stream?.getTracks().forEach((track) => track.stop());
}

// Press-and-hold voice recording. Spread `holdProps` on the mic button.
// Release to send (calls onRecorded({ blob, duration, mimeType })), drag off the
// button to cancel. Recordings under 1 s are dropped; recording stops at 2 min.
// The microphone needs HTTPS (or localhost).
export function useVoiceRecorder(onRecorded) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState(null);

  const sessionRef = useRef(null);
  const onRecordedRef = useRef(onRecorded);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
  });

  const finish = useCallback((cancelled) => {
    const session = sessionRef.current;
    // Ignore repeats: on touch screens pointerleave fires right after pointerup.
    if (!session || session.released) return;
    session.released = true;
    session.cancelled = cancelled;
    // Without a recorder we're still waiting for mic permission; start() cleans up.
    if (session.recorder?.state === 'recording') session.recorder.stop();
  }, []);

  const stop = useCallback(() => finish(false), [finish]);
  const cancel = useCallback(() => finish(true), [finish]);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    setError(null);
    if (!isVoiceRecordingSupported()) {
      setError('Voice notes are not supported in this browser');
      return;
    }

    const session = { chunks: [], released: false, cancelled: false };
    sessionRef.current = session;

    try {
      session.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      sessionRef.current = null;
      setError(err?.name === 'NotAllowedError' ? 'Microphone permission was denied' : 'Could not access the microphone');
      return;
    }

    // Button released while the permission prompt was open.
    if (session.released) {
      releaseResources(session);
      sessionRef.current = null;
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(session.stream, mimeType ? { mimeType } : undefined);
    session.recorder = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size) session.chunks.push(event.data);
    };

    recorder.onstop = () => {
      releaseResources(session);
      sessionRef.current = null;
      setIsRecording(false);
      setElapsedMs(0);

      const durationMs = Math.min(Date.now() - session.startedAt, MAX_DURATION_MS);
      if (session.cancelled || durationMs < MIN_DURATION_MS || !session.chunks.length) return;

      const type = recorder.mimeType || mimeType || 'audio/webm';
      onRecordedRef.current?.({
        blob: new Blob(session.chunks, { type }),
        duration: Math.round(durationMs / 100) / 10,
        mimeType: type,
      });
    };

    session.startedAt = Date.now();
    recorder.start();
    session.ticker = setInterval(() => setElapsedMs(Date.now() - session.startedAt), 200);
    session.autoStop = setTimeout(() => finish(false), MAX_DURATION_MS);
    setIsRecording(true);
  }, [finish]);

  // Unmounting mid-recording discards it and frees the microphone.
  useEffect(() => cancel, [cancel]);

  const isHoldKey = (event) => event.key === ' ' || event.key === 'Enter';

  const holdProps = {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      start();
    },
    onPointerUp: stop,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onKeyDown: (event) => {
      if (!isHoldKey(event) || event.repeat) return;
      event.preventDefault();
      start();
    },
    onKeyUp: (event) => {
      if (!isHoldKey(event)) return;
      event.preventDefault();
      stop();
    },
    onContextMenu: (event) => event.preventDefault(),
  };

  return {
    isSupported: isVoiceRecordingSupported(),
    isRecording,
    elapsedMs,
    maxDurationMs: MAX_DURATION_MS,
    error,
    start,
    stop,
    cancel,
    holdProps,
  };
}
