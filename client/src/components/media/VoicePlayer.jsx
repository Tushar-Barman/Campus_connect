import { Pause, Play } from 'lucide-react';
import { useAudioPlayer } from '@p3/hooks/useAudioPlayer.js';
import { formatDuration } from '../../lib/media.js';

/**
 * Voice-note bubble player. Playback logic is P3's useAudioPlayer(src, knownDuration).
 * P3's seek() takes SECONDS (0 → duration), so the 0–1 click position is multiplied by the total.
 */
export default function VoicePlayer({ src, duration = 0, mine }) {
  const player = useAudioPlayer(src, duration);
  const { isPlaying, currentTime, progress, error, toggle, seek } = player;
  const total = player.duration || duration || 0;

  const onSeekClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    seek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * total);
  };

  const onKeyDown = (event) => {
    if (!total) return;
    if (event.key === 'ArrowRight') seek(Math.min(total, currentTime + 5));
    else if (event.key === 'ArrowLeft') seek(Math.max(0, currentTime - 5));
    else return;
    event.preventDefault();
  };

  const Icon = isPlaying ? Pause : Play;

  return (
    <div className="flex w-56 max-w-full items-center gap-3 py-0.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          mine ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-brand-100 text-brand-700 hover:bg-brand-200'
        }`}
      >
        <Icon className={`h-4 w-4 ${isPlaying ? '' : 'translate-x-px'}`} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Voice note position"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatDuration(currentTime)} of ${formatDuration(total)}`}
          onClick={onSeekClick}
          onKeyDown={onKeyDown}
          className="flex h-5 cursor-pointer items-center"
        >
          <div className={`h-1.5 w-full overflow-hidden rounded-full ${mine ? 'bg-white/25' : 'bg-surface-muted'}`}>
            <div className={`h-full rounded-full ${mine ? 'bg-white' : 'bg-brand-500'}`} style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <p className={`text-[11px] ${mine ? 'text-on-accent-muted' : 'text-ink-subtle'}`}>
          {error ? "Can't play this voice note" : formatDuration(isPlaying || currentTime ? currentTime : total)}
        </p>
      </div>
    </div>
  );
}
