import { RidgeMark } from './Ridge.jsx';

export default function Logo({ inverted = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${inverted ? 'bg-white/15 text-white' : 'bg-gradient-to-br from-brand-500 to-accent-strong text-white'}`}
      >
        <RidgeMark className="h-6 w-6" />
      </span>
      <span className={`font-display text-lg font-extrabold tracking-tight ${inverted ? 'text-white' : 'text-ink'}`}>
        Campus<span className={inverted ? 'text-on-accent-muted' : 'text-accent'}>Connect</span>
      </span>
    </span>
  );
}
