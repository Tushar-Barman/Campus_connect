import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, CheckCheck, Monitor, Moon, Palette, ShieldCheck, Sun, UserRound } from 'lucide-react';
import Button, { buttonClass } from '../components/ui/Button.jsx';
import Segmented from '../components/ui/Segmented.jsx';
import Switch from '../components/ui/Switch.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import BlockedUsersList from '../components/account/BlockedUsersList.jsx';
import DeleteAccountDialog from '../components/account/DeleteAccountDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ACCENTS, useAppearance } from '../lib/appearance.js';
import { useUpdateSettings } from '../lib/useSettings.js';

function Card({ id, title, Icon, children, tone = '' }) {
  return (
    <section aria-labelledby={id} className={`rounded-card border bg-surface p-5 shadow-card animate-slide-up sm:p-6 ${tone || 'border-border'}`}>
      <h2 id={id} className="mb-5 flex items-center gap-2 text-base font-bold">
        <Icon className="h-4.5 w-4.5 text-accent" aria-hidden="true" />
        {title}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

// Two sample bubbles that follow every appearance setting live.
function Preview() {
  return (
    <div className="cc-topo overflow-hidden rounded-xl border border-border bg-canvas p-4" aria-label="Preview" role="img">
      <div className="max-w-[80%] rounded-bubble rounded-bl-md bg-surface px-3.5 py-2 text-sm text-ink shadow-sm">
        Library at 6? I booked a room on the 2nd floor.
        <span className="mt-0.5 block text-right text-[10px] text-ink-subtle">17:58</span>
      </div>
      <div className="cc-msg ml-auto max-w-[80%] rounded-bubble rounded-br-md bg-brand-600 px-3.5 py-2 text-sm text-white shadow-sm">
        Perfect, see you there 🙌
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-on-accent-muted">
          18:01 <CheckCheck className="h-3.5 w-3.5 text-read" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

/** Round 2: Appearance, Privacy and Account settings. */
export default function Settings() {
  const { user, forgetSession } = useAuth();
  const { appearance } = useAppearance();
  const updateSettings = useUpdateSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const receiptsOn = user?.settings?.readReceipts !== false;

  const onAccountDeleted = () => {
    forgetSession();
    navigate('/', { replace: true });
    toast.success('Your account was deleted');
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface/95 px-2 py-2.5 backdrop-blur sm:px-4">
        <Link to="/chat" aria-label="Back to chats" className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="text-lg font-bold">Settings</h1>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <Card id="appearance-title" title="Appearance" Icon={Palette}>
          <Preview />
          <Segmented
            label="Theme"
            value={appearance.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'light', label: 'Light', Icon: Sun },
              { value: 'dark', label: 'Dark', Icon: Moon },
              { value: 'system', label: 'System', Icon: Monitor },
            ]}
            description="System follows your device and switches automatically."
          />
          <div>
            <p id="accent-label" className="text-sm font-medium text-ink">
              Accent colour
            </p>
            <div role="radiogroup" aria-labelledby="accent-label" className="mt-2 flex flex-wrap gap-3">
              {ACCENTS.map(({ id, label }) => {
                const selected = appearance.accent === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={label}
                    title={label}
                    data-accent={id}
                    onClick={() => updateSettings({ accent: id })}
                    // var(--a-600) resolves on this element, so each swatch shows its own accent.
                    className={`flex h-10 w-10 items-center justify-center rounded-full bg-[var(--a-600)] text-white shadow-sm ring-offset-2 ring-offset-surface transition-transform duration-150 hover:scale-105 ${
                      selected ? 'ring-2 ring-[var(--a-600)]' : ''
                    }`}
                  >
                    {selected ? <Check className="h-5 w-5" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <Segmented
            label="Density"
            value={appearance.density}
            onChange={(density) => updateSettings({ density })}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
          <Segmented
            label="Text size"
            value={appearance.fontScale}
            onChange={(fontScale) => updateSettings({ fontScale })}
            options={[
              { value: 'sm', label: 'Small' },
              { value: 'md', label: 'Medium' },
              { value: 'lg', label: 'Large' },
            ]}
          />
          <Segmented
            label="Bubble shape"
            value={appearance.bubbleStyle}
            onChange={(bubbleStyle) => updateSettings({ bubbleStyle })}
            options={[
              { value: 'rounded', label: 'Rounded' },
              { value: 'soft', label: 'Soft' },
              { value: 'sharp', label: 'Sharp' },
            ]}
          />
        </Card>

        <Card id="privacy-title" title="Privacy" Icon={ShieldCheck}>
          <Switch
            label="Read receipts"
            description="When this is off, nobody sees when you've read their messages, in private chats and groups, and you won't see read receipts from others either. Unread counts still work."
            checked={receiptsOn}
            onChange={(readReceipts) => updateSettings({ readReceipts })}
          />
          <div>
            <h3 className="mb-2 text-sm font-medium text-ink">Blocked people</h3>
            <BlockedUsersList />
          </div>
        </Card>

        <Card id="account-title" title="Account" Icon={UserRound}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-ink-subtle">{user?.email}</p>
            </div>
            <Link to="/profile" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              Edit profile
            </Link>
          </div>
          <div className="rounded-xl border border-danger/30 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-danger">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Delete account
            </p>
            <p className="mt-1 text-sm text-ink-muted">Permanently delete your account, your private chats and your messages in groups.</p>
            <Button variant="danger" size="sm" className="mt-3" onClick={() => setDeleting(true)}>
              Delete account
            </Button>
          </div>
        </Card>
      </main>
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} onDeleted={onAccountDeleted} />
    </div>
  );
}
