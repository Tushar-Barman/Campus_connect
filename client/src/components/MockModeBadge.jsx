import { FlaskConical } from 'lucide-react';
import { USE_MOCKS } from '../lib/api.js';

// Always-visible reminder so a mock build is never mistaken for the real thing.
export default function MockModeBadge() {
  if (!USE_MOCKS) return null;
  return (
    <div className="pointer-events-none fixed bottom-24 left-3 z-40 opacity-90 md:bottom-3 inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1.5 text-xs font-semibold text-warning-ink shadow-card">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
      Mock API
    </div>
  );
}
