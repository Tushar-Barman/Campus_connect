import { useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { Alert } from '../ui/Feedback.jsx';
import CampusSelect from './CampusSelect.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { getErrorMessage, usersApi } from '../../lib/api.js';
import { useCampuses } from '../../lib/campuses.js';

/**
 * Accounts created before campuses existed have campus === ''. Ask once, after login;
 * it can't be dismissed, but it's one field and one click.
 * (Mock-mode users have no campus field at all, so they never see this.)
 */
export default function CampusPrompt() {
  const { user, updateUser } = useAuth();
  const { campuses } = useCampuses();
  const [campus, setCampus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const open = user?.campus === '';

  const save = async () => {
    if (!campus) {
      setError('Choose your campus to continue');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { user: updated } = await usersApi.updateProfile({ campus });
      updateUser(updated);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not save your campus.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {}}
      dismissible={false}
      size="sm"
      title="Which campus are you on?"
      footer={
        <Button onClick={save} loading={saving} fullWidth>
          Continue
        </Button>
      }
    >
      <p className="mb-4 text-sm text-ink-muted">
        CampusConnect now groups people by campus, so search shows your classmates first. You can change this later on
        your profile.
      </p>
      {error ? <Alert className="mb-3">{error}</Alert> : null}
      <CampusSelect campuses={campuses} value={campus} onChange={(id) => {
        setCampus(id);
        setError('');
      }} label="Your campus" />
      <div className="h-44" aria-hidden="true" />
    </Modal>
  );
}
