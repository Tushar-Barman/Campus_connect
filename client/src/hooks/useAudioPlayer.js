import { useCallback, useEffect, useRef, useState } from 'react';

// Only one voice note plays at a time across the whole app.
let currentlyPlaying = null;

// Playback state for a custom voice-note player. `knownDuration` (seconds,
// from the message) is shown until the browser reports the real duration;
// WebM recordings often report Infinity, so the stored value matters.
export function useAudioPlayer(src, knownDuration = 0) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(knownDuration);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDuration(knownDuration);
  }, [knownDuration]);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setError(null);
    if (!src) return undefined;

    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = src;
    audioRef.current = audio;

    const handlers = {
      timeupdate: () => setCurrentTime(audio.currentTime),
      loadedmetadata: () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
      },
      play: () => setIsPlaying(true),
      pause: () => setIsPlaying(false),
      ended: () => {
        setIsPlaying(false);
        setCurrentTime(0);
      },
      error: () => {
        setIsPlaying(false);
        setError('Could not play this voice note');
      },
    };
    Object.entries(handlers).forEach(([event, handler]) => audio.addEventListener(event, handler));

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => audio.removeEventListener(event, handler));
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (currentlyPlaying === audio) currentlyPlaying = null;
      audioRef.current = null;
    };
  }, [src]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (currentlyPlaying && currentlyPlaying !== audio) currentlyPlaying.pause();
    currentlyPlaying = audio;
    setError(null);
    audio.play().catch(() => setError('Could not play this voice note'));
  }, []);

  // `seconds` from 0 to duration, e.g. from a range input.
  const seek = useCallback(
    (seconds) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      audio.currentTime = Math.max(0, Math.min(seconds, duration));
      setCurrentTime(audio.currentTime);
    },
    [duration],
  );

  return {
    isPlaying,
    currentTime,
    duration,
    progress: duration ? Math.min(currentTime / duration, 1) : 0,
    error,
    toggle,
    seek,
  };
}
