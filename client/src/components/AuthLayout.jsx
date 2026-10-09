import { Link } from 'react-router-dom';
import { MessageCircle, Mic, Sparkles, Users } from 'lucide-react';
import Logo from './ui/Logo.jsx';
import Ridge from './ui/Ridge.jsx';

const POINTS = [
  { icon: MessageCircle, text: 'Instant one-to-one chats with read receipts' },
  { icon: Users, text: 'Groups for clubs, projects and hostels' },
  { icon: Mic, text: 'Voice notes when typing is too slow' },
  { icon: Sparkles, text: 'Chat Memory: decisions and dates, summarised' },
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="cc-topo flex min-h-dvh bg-canvas">
      <aside className="cc-topo cc-topo-strong relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-accent-strongest p-10 text-white lg:flex">
        <Ridge className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-white/10" />
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-brand-600/40 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute top-1/3 -left-20 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
        <Link to="/" className="relative w-fit rounded-xl">
          <Logo inverted />
        </Link>
        <div className="relative">
          <h2 className="text-4xl leading-tight font-extrabold tracking-tight">
            Every conversation on campus, in one place.
          </h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-on-accent-muted">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                  <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-on-accent-muted">Built for First Commit · IIT Mandi</p>
      </aside>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
        <Link to="/" className="mb-8 rounded-xl lg:hidden">
          <Logo />
        </Link>
        <div className="w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-card sm:p-8 animate-slide-up">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-sm text-ink-muted">{footer}</div> : null}
      </main>
    </div>
  );
}
