// STAND-IN for P3's hooks/useAudioPlayer.js
// useAudioPlayer(src, knownDuration) → { isPlaying, currentTime, duration, progress, error, toggle, seek }
// seek(fraction) takes 0–1 (matches `progress`). CONFIRM WITH P3 — see P2_INTEGRATION.md.
import { useCallback, useEffect, useRef, useState } from 'react';

const PLAY_EVENT = 'cc:audio-play';

export function useAudioPlayer(src, knownDuration = 0) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!src) return undefined;
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = src;
    audioRef.current = audio;
    const on = {
      play: () => setIsPlaying(true),
      pause: () => setIsPlaying(false),
      ended: () => {
        setIsPlaying(false);
        setCurrentTime(0);
      },
      timeupdate: () => setCurrentTime(audio.currentTime),
      loadedmetadata: () => Number.isFinite(audio.duration) && setMediaDuration(audio.duration),
      error: () => setError("Can't play this voice note"),
    };
    Object.entries(on).forEach(([e, fn]) => audio.addEventListener(e, fn));
    const onOther = (event) => event.detail !== audio && audio.pause();
    window.addEventListener(PLAY_EVENT, onOther);
    return () => {
      audio.pause();
      Object.entries(on).forEach(([e, fn]) => audio.removeEventListener(e, fn));
      window.removeEventListener(PLAY_EVENT, onOther);
      audioRef.current = null;
    };
  }, [src]);

  const duration = knownDuration || mediaDuration;

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: audio }));
    try {
      await audio.play();
      setError('');
    } catch {
      setError("Can't play this voice note");
    }
  }, []);

  const seek = useCallback(
    (seconds) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      audio.currentTime = Math.max(0, Math.min(seconds, duration));
      setCurrentTime(audio.currentTime);
    },
    [duration],
  );

  return { isPlaying, currentTime, duration, progress: duration ? Math.min(1, currentTime / duration) : 0, error, toggle, seek };
}

export default useAudioPlayer;
