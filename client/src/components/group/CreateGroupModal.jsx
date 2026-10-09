import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, X } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Avatar from '../ui/Avatar.jsx';
import { Alert } from '../ui/Feedback.jsx';
import UserPicker from '../users/UserPicker.jsx';
import { useConversationList } from '../../context/ConversationsContext.jsx';
import { useToast } from '../ui/Toast.jsx';
import { conversationsApi, getErrorMessage } from '../../lib/api.js';

export default function CreateGroupModal({ open, onClose }) {
  const { reload } = useConversationList();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [members, setMembers] = useState([]);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setMembers([]);
    setErrors({});
    setServerError('');
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const toggle = (user) => {
    setMembers((list) => (list.some((u) => u._id === user._id) ? list.filter((u) => u._id !== user._id) : [...list, user]));
    setErrors((e) => ({ ...e, members: undefined }));
  };

  const submit = async (event) => {
    event?.preventDefault();
    const clean = name.trim();
    const found = {};
    if (!clean) found.name = 'Give the group a name';
    else if (clean.length > 50) found.name = 'Group name must be at most 50 characters';
    if (members.length === 0) found.members = 'Add at least one member';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    setServerError('');
    try {
      const { conversation } = await conversationsApi.createGroup({ name: clean, memberIds: members.map((u) => u._id) });
      await reload();
      toast.success(`${clean} created`);
      reset();
      onClose();
      if (conversation?._id) navigate(`/chat/${conversation._id}`);
    } catch (err) {
      setServerError(getErrorMessage(err, 'Could not create the group.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="New group"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            <Users className="h-4 w-4" aria-hidden="true" />
            Create group
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {serverError ? <Alert>{serverError}</Alert> : null}
        <Input
          label="Group name"
          placeholder="e.g. Robotics Club, DSA study group"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((x) => ({ ...x, name: undefined }));
          }}
          error={errors.name}
          maxLength={50}
          autoFocus
        />

        <div>
          <p className="mb-1.5 text-sm font-medium">
            Members <span className="font-normal text-ink-subtle">({members.length} selected)</span>
          </p>
          {members.length ? (
            <ul className="mb-3 flex flex-wrap gap-1.5">
              {members.map((u) => (
                <li key={u._id} className="flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pr-1 pl-1 text-xs font-medium text-brand-800">
                  <Avatar name={u.name} src={u.profilePicture} size="xs" />
                  {u.name.split(' ')[0]}
                  <button
                    type="button"
                    onClick={() => toggle(u)}
                    aria-label={`Remove ${u.name}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand-100"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {errors.members ? <p className="mb-2 text-xs text-danger" role="alert">{errors.members}</p> : null}
          <UserPicker label="Search people" onPick={toggle} selectedIds={members.map((u) => u._id)} />
        </div>
      </form>
    </Modal>
  );
}
