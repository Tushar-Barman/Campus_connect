/**
 * Round 2 identity: layered Himalayan ridgelines (think the Dhauladhar from Kamand).
 * Decorative only. Colour comes from `currentColor`, so set it with a text-* class.
 */
export default function Ridge({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 1200 160" preserveAspectRatio="none" fill="currentColor" aria-hidden="true" focusable="false">
      <path opacity="0.35" d="M0 96 L90 52 L150 78 L230 24 L310 70 L380 44 L470 92 L560 36 L640 74 L720 30 L800 82 L880 48 L960 88 L1040 40 L1120 76 L1200 50 V160 H0Z" />
      <path opacity="0.6" d="M0 120 L110 82 L190 108 L270 64 L350 104 L430 78 L520 116 L610 72 L700 110 L780 70 L870 112 L950 84 L1040 118 L1120 86 L1200 104 V160 H0Z" />
      <path d="M0 146 L120 118 L210 138 L300 108 L400 140 L500 116 L600 144 L700 112 L800 140 L900 120 L1000 146 L1100 122 L1200 140 V160 H0Z" />
    </svg>
  );
}

/** The logo mark: two peaks and a rising sun, on the accent. */
export function RidgeMark({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="16.5" cy="7.5" r="2.25" fill="currentColor" opacity="0.65" />
      <path d="M2.5 19.5 L9 8.5 L12.6 14.2 L15 11 L21.5 19.5 Z" fill="currentColor" />
      <path d="M7.3 11.4 L9 8.5 L10.7 11.2 L9.6 12.2 L9 11.6 L8.3 12.3 Z" fill="currentColor" opacity="0.45" />
    </svg>
  );
}
