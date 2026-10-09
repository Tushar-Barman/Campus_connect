import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, CheckCheck, MessageCircle, Mic, ShieldCheck, Sparkles, Users } from 'lucide-react';
import Logo from '../components/ui/Logo.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import { buttonClass } from '../components/ui/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const FEATURES = [
  { icon: MessageCircle, title: 'Real-time chat', text: 'Messages arrive instantly, with typing indicators and read receipts.' },
  { icon: Users, title: 'Groups', text: 'One place for your club, project team or hostel wing.' },
  { icon: Mic, title: 'Voice notes', text: 'Hold to record, release to send. Faster than typing on the way to class.' },
  { icon: Sparkles, title: 'Chat Memory', text: 'AI pulls out the decisions, action items and dates from a long chat.' },
];

function PreviewCard() {
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2rem] bg-brand-200/40 blur-2xl" />
      <div className="relative rounded-card border border-border bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Avatar name="Robotics Club" size="sm" />
          <div>
            <p className="text-sm font-semibold">Robotics Club</p>
            <p className="text-xs text-brand-600">Diya is typing…</p>
          </div>
        </div>
        <div className="space-y-2.5 bg-canvas px-4 py-4">
          <div className="max-w-[80%] rounded-bubble rounded-bl-md bg-surface px-3.5 py-2 text-sm shadow-sm">
            Workshop moved to Saturday, 4 pm in the North Campus lab.
          </div>
          <div className="ml-auto max-w-[80%] rounded-bubble rounded-br-md bg-brand-600 px-3.5 py-2 text-sm text-white">
            Perfect, I'll bring the Arduino kits.
            <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-brand-100">
              4:12 pm <CheckCheck className="h-3.5 w-3.5 text-read" />
            </span>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span><strong>Chat Memory:</strong> Workshop on Sat 4 pm · Aarav brings kits</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { status } = useAuth();
  if (status === 'authed') return <Navigate to="/chat" replace />;

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link to="/login" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
            Log in
          </Link>
          <Link to="/register" className={buttonClass({ size: 'sm' })}>
            Sign up
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div className="animate-slide-up">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Made for IIT Mandi
            </span>
            <h1 className="mt-5 text-4xl leading-[1.1] font-extrabold tracking-tight sm:text-5xl">
              Your campus, in one <span className="text-brand-600">conversation</span>.
            </h1>
            <p className="mt-5 max-w-lg text-base text-ink-muted sm:text-lg">
              Chat one-to-one, run your club in a group, send a voice note between lectures, and let Chat Memory
              remember what was decided.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className={buttonClass({ size: 'lg' })}>
                Get started
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/login" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
                I already have an account
              </Link>
            </div>
          </div>
          <PreviewCard />
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-card border border-border bg-canvas p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-sm font-bold">{title}</h2>
                <p className="mt-1 text-sm text-ink-muted">{text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="px-4 py-6 text-center text-xs text-ink-subtle">
        Built in 24 hours for First Commit · KamandPrompt, IIT Mandi
      </footer>
    </div>
  );
}
