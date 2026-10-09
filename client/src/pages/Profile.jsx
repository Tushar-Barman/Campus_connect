import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import { Alert } from '../components/ui/Feedback.jsx';
import PictureUploader from '../components/media/PictureUploader.jsx';
import Switch from '../components/ui/Switch.jsx';
import DeleteAccountDialog from '../components/account/DeleteAccountDialog.jsx';
import CampusSelect from '../components/campus/CampusSelect.jsx';
import { useCampuses } from '../lib/campuses.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { getErrorMessage, usersApi } from '../lib/api.js';
import { validateName } from '../lib/validation.js';

const BIO_MAX = 160;

export default function Profile() {
  const { user, updateUser, forgetSession } = useAuth();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  // The account no longer exists: drop the session locally (no logout call) and go home.
  const onAccountDeleted = () => {
    forgetSession();
    navigate('/', { replace: true });
    toast.success('Your account was deleted');
  };
  const toast = useToast();

  const { campuses } = useCampuses();
  const [form, setForm] = useState({ name: user?.name || '', bio: user?.bio || '', campus: user?.campus || '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  const dirty =
    form.name.trim() !== (user?.name || '') ||
    form.bio.trim() !== (user?.bio || '') ||
    form.campus !== (user?.campus || '');

  const save = async (event) => {
    event.preventDefault();
    const nameError = validateName(form.name);
    const found = {
      ...(nameError ? { name: nameError } : {}),
      ...(form.bio.length > BIO_MAX ? { bio: `Bio must be at most ${BIO_MAX} characters` } : {}),
    };
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setServerError('');
    try {
      const { user: updated } = await usersApi.updateProfile({
        name: form.name.trim(),
        bio: form.bio.trim(),
        ...(form.campus ? { campus: form.campus } : {}),
      });
      updateUser(updated);
      setForm({ name: updated.name, bio: updated.bio || '', campus: updated.campus || '' });
      toast.success('Profile saved');
    } catch (err) {
      setServerError(getErrorMessage(err, 'Could not save your profile.'));
    } finally {
      setSaving(false);
    }
  };

  // Round 2: read receipts (moves to the Settings page later).
  const [savingReceipts, setSavingReceipts] = useState(false);
  const receiptsOn = user?.settings?.readReceipts !== false;
  const setReceipts = async (on) => {
    setSavingReceipts(true);
    try {
      const { settings } = await usersApi.updateSettings({ readReceipts: on });
      updateUser({ settings });
      toast.success(on ? 'Read receipts turned on' : 'Read receipts turned off');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not change read receipts.'));
    } finally {
      setSavingReceipts(false);
    }
  };

  const uploadPicture = async (file, onProgress) => {
    const { user: updated } = await usersApi.uploadPicture(file, onProgress);
    updateUser(updated);
  };

  const removePicture = async () => {
    const { user: updated } = await usersApi.removePicture();
    updateUser(updated);
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface px-2 py-2.5 sm:px-4">
        <Link
          to="/chat"
          aria-label="Back to chats"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <h1 className="text-base font-semibold">Your profile</h1>
      </header>

      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="rounded-card border border-border bg-surface p-6 shadow-card animate-slide-up">
          <PictureUploader
            name={user?.name}
            src={user?.profilePicture}
            label="photo"
            onUpload={uploadPicture}
            onRemove={removePicture}
            onDone={toast.success}
          />

          <form onSubmit={save} noValidate className="mt-8 space-y-4">
            {serverError ? <Alert>{serverError}</Alert> : null}
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
                setErrors((x) => ({ ...x, name: undefined }));
              }}
              error={errors.name}
              maxLength={50}
              autoComplete="name"
            />
            <div>
              <label htmlFor="bio" className="mb-1.5 block text-sm font-medium">
                Bio <span className="font-normal text-ink-subtle">(optional)</span>
              </label>
              <textarea
                id="bio"
                rows={3}
                value={form.bio}
                onChange={(e) => {
                  setForm((f) => ({ ...f, bio: e.target.value }));
                  setErrors((x) => ({ ...x, bio: undefined }));
                }}
                placeholder="e.g. B.Tech CSE · Robotics Club"
                aria-invalid={errors.bio ? true : undefined}
                aria-describedby="bio-help"
                className={`block w-full resize-none rounded-xl border bg-surface px-3 py-2.5 text-sm placeholder:text-ink-subtle focus:ring-4 focus:outline-none ${
                  errors.bio ? 'border-danger focus:ring-danger/15' : 'border-border focus:border-brand-500 focus:ring-brand-500/15'
                }`}
              />
              <p id="bio-help" className={`mt-1.5 text-right text-xs ${form.bio.length > BIO_MAX ? 'text-danger' : 'text-ink-subtle'}`}>
                {errors.bio || `${form.bio.length}/${BIO_MAX}`}
              </p>
            </div>
            <CampusSelect
              campuses={campuses}
              value={form.campus}
              onChange={(campus) => setForm((f) => ({ ...f, campus }))}
              hint="People search starts with this campus."
            />
            <Input label="Email" icon={Mail} value={user?.email || ''} disabled hint="Your email can't be changed." />
            <Button type="submit" fullWidth size="lg" loading={saving} disabled={!dirty}>
              {saving ? 'Saving' : 'Save changes'}
            </Button>
          </form>
        </div>

        {user?.settings ? (
          <section className="mt-6 rounded-card border border-border bg-surface p-6 shadow-card animate-slide-up" aria-labelledby="privacy-title">
            <h2 id="privacy-title" className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Privacy
            </h2>
            <Switch
              label="Read receipts"
              description="When this is off, nobody sees when you've read their messages, in private chats and groups, and you won't see read receipts from others either. Unread counts still work."
              checked={receiptsOn}
              busy={savingReceipts}
              onChange={setReceipts}
            />
          </section>
        ) : null}

        <section className="mt-6 rounded-card border border-danger/30 bg-surface p-6 shadow-card animate-slide-up" aria-labelledby="danger-title">
          <h2 id="danger-title" className="flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Danger zone
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Permanently delete your account, your private chats and your messages in groups.
          </p>
          <Button variant="danger" className="mt-4" onClick={() => setDeleting(true)}>
            Delete account
          </Button>
        </section>
        <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} onDeleted={onAccountDeleted} />
      </main>
    </div>
  );
}
