import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input, { PasswordInput } from '../ui/Input.jsx';
import { Alert } from '../ui/Feedback.jsx';
import { getErrorMessage, usersApi } from '../../lib/api.js';

const CONFIRM_WORD = 'DELETE';

/**
 * Round 2: permanent account deletion. The user types DELETE and their password.
 * A wrong password shows an error here (it does not log them out).
 * onDeleted() runs after the server confirms.
 */
export default function DeleteAccountDialog({ open, onClose, onDeleted }) {
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setTyped('');
    setPassword('');
    setError('');
    onClose();
  };

  const ready = typed.trim() === CONFIRM_WORD && password.length > 0;

  const submit = async (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await usersApi.deleteAccount(password);
      onDeleted();
    } catch (err) {
      setError(
        err.response?.status === 401 ? 'That password is incorrect.' : getErrorMessage(err, 'Could not delete your account. Please try again.'),
      );
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Delete your account?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" form="delete-account-form" disabled={!ready} loading={busy}>
            {busy ? null : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            Delete my account
          </Button>
        </>
      }
    >
      <form id="delete-account-form" onSubmit={submit} className="space-y-4">
        <div className="text-sm text-ink-muted">
          <p className="font-medium text-ink">This can't be undone.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your private chats are deleted for both people.</li>
            <li>You leave all your groups, and your messages there are removed.</li>
            <li>Your profile, photo and settings are deleted.</li>
            <li>You're signed out on every device.</li>
          </ul>
        </div>
        {error ? <Alert>{error}</Alert> : null}
        <Input
          label={`Type ${CONFIRM_WORD} to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <PasswordInput
          label="Your password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError('');
          }}
          autoComplete="current-password"
        />
      </form>
    </Modal>
  );
}
