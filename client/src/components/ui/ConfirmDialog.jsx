import { useState } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import { Alert } from './Feedback.jsx';
import { getErrorMessage } from '../../lib/api.js';

/** "Are you sure?" dialog. onConfirm may be async; errors are shown inside the dialog. */
export default function ConfirmDialog({ open, onClose, title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (busy) return;
    setError('');
    onClose();
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      setBusy(false);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={confirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error ? <Alert className="mb-3">{error}</Alert> : null}
      <p className="text-sm text-ink-muted">{message}</p>
    </Modal>
  );
}
