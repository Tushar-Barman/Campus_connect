import { useEffect, useState } from 'react';
import { getInitials } from '../../lib/format.js';

const SIZES = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-24 w-24 text-2xl',
};

const DOT_SIZES = { xs: 'h-2 w-2', sm: 'h-2.5 w-2.5', md: 'h-3 w-3', lg: 'h-3.5 w-3.5', xl: 'h-5 w-5' };

const TONES = ['bg-tone-1', 'bg-tone-2', 'bg-tone-3', 'bg-tone-4', 'bg-tone-5'];

function toneFor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

export default function Avatar({ name = '', src, size = 'md', online, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]); // a new picture gets a fresh chance to load
  const showImage = src && !failed;

  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt={name}
          onError={() => setFailed(true)}
          className={`${SIZES[size]} rounded-full object-cover`}
        />
      ) : (
        <span
          role="img"
          aria-label={name || 'User'}
          className={`${SIZES[size]} ${toneFor(name)} inline-flex items-center justify-center rounded-full font-semibold text-ink`}
        >
          {getInitials(name)}
        </span>
      )}
      {typeof online === 'boolean' ? (
        <span
          className={`absolute right-0 bottom-0 ${DOT_SIZES[size]} rounded-full ring-2 ring-surface ${online ? 'bg-success' : 'bg-border-strong'}`}
          aria-label={online ? 'Online' : 'Offline'}
          role="status"
        />
      ) : null}
    </span>
  );
}
