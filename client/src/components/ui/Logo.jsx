import { Mountain } from 'lucide-react';

export default function Logo({ inverted = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl ${inverted ? 'bg-white/15 text-white' : 'bg-accent-strong text-white'}`}
      >
        <Mountain className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className={`text-lg font-extrabold tracking-tight ${inverted ? 'text-white' : 'text-ink'}`}>
        Campus<span className={inverted ? 'text-on-accent-muted' : 'text-accent'}>Connect</span>
      </span>
    </span>
  );
}
