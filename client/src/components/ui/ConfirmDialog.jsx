import { useState } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import { Alert } from './Feedback.jsx';
import { getErrorMessage } from '../../lib/api.js';

/**
 * "Are you sure?" dialog. onConfirm may be async; errors are shown inside the dialog.
 * For several choices (e.g. "Delete for everyone" / "Delete for me"), pass
 * `actions: [{ label, onConfirm, danger? }]` instead of confirmLabel/onConfirm.
 */
export default function ConfirmDialog({ open, onClose, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, actions }) {
  const [busyIndex, setBusyIndex] = useState(-1);
  const [error, setError] = useState('');
  const busy = busyIndex !== -1;

  const choices = actions ?? [{ label: confirmLabel, onConfirm, danger }];

  const close = () => {
    if (busy) return;
    setError('');
    onClose();
  };

  const run = (index) => async () => {
    setBusyIndex(index);
    setError('');
    try {
      await choices[index].onConfirm();
      setBusyIndex(-1);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusyIndex(-1);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          {choices.map((choice, index) => (
            <Button
              key={choice.label}
              variant={choice.danger ? 'danger' : 'primary'}
              onClick={run(index)}
              loading={busyIndex === index}
              disabled={busy && busyIndex !== index}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      }
    >
      {error ? <Alert className="mb-3">{error}</Alert> : null}
      <p className="text-sm text-ink-muted">{message}</p>
    </Modal>
  );
}
