import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, LogOut, Pencil, UserMinus, UserPlus, Users, X } from 'lucide-react';
import Drawer from '../ui/Drawer.jsx';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import { Badge } from '../ui/Feedback.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import UserPicker from '../users/UserPicker.jsx';
import { usePresence } from '@p3/hooks/usePresence.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useConversationList } from '../../context/ConversationsContext.jsx';
import { useToast } from '../ui/Toast.jsx';
import { useNow } from '../../lib/useNow.js';
import { conversationsApi, getErrorMessage } from '../../lib/api.js';
import { formatLastSeen } from '../../lib/format.js';
import { idOf } from '../../lib/conversation.js';

function NameEditor({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(value);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center justify-center gap-1">
        <h3 className="text-lg font-bold">{value}</h3>
        <Button variant="ghost" size="icon-sm" onClick={() => { setName(value); setEditing(true); }} aria-label="Rename group">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  const save = async (event) => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean || clean.length > 50) {
      setError('Group name must be 1–50 characters');
      return;
    }
    setSaving(true);
    try {
      await onSave(clean);
      setEditing(false);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="flex items-start gap-1">
      <Input aria-label="Group name" value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={50} autoFocus className="flex-1" />
      <Button type="submit" size="icon" loading={saving} aria-label="Save name">
        {saving ? null : <Check className="h-4 w-4" aria-hidden="true" />}
      </Button>
      <Button variant="ghost" size="icon" onClick={() => setEditing(false)} aria-label="Cancel rename">
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  );
}

function MemberRow({ member, isMe, isAdminRow, canRemove, onRemove, now }) {
  const presence = usePresence(member); // P3 hook
  const online = isMe || presence.online;
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2">
      <Avatar name={member.name} src={member.profilePicture} size="sm" online={online} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
          <span className="truncate">{isMe ? 'You' : member.name}</span>
          {isAdminRow ? <Badge tone="soft">Admin</Badge> : null}
        </p>
        <p className={`truncate text-xs ${online ? 'text-success' : 'text-ink-subtle'}`}>
          {online ? 'online' : formatLastSeen(presence.lastSeen, now)}
        </p>
      </div>
      {canRemove ? (
        <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${member.name} from group`}>
          <UserMinus className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}

export default function GroupInfoPanel({ conversation, open, onClose }) {
  const { user } = useAuth();
  const myId = user?._id;
  const { reload } = useConversationList();
  const toast = useToast();
  const navigate = useNavigate();
  const now = useNow(30000);

  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [leaving, setLeaving] = useState(false);

  const id = conversation._id;
  const adminId = idOf(conversation.groupAdmin);
  const isAdmin = adminId === myId;
  const members = [...conversation.participants].sort((a, b) => {
    if (idOf(a) === myId) return -1;
    if (idOf(b) === myId) return 1;
    if (idOf(a) === adminId) return -1;
    if (idOf(b) === adminId) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });
  const memberIds = members.map(idOf);

  const add = async (person) => {
    setBusyId(person._id);
    try {
      await conversationsApi.addMember(id, person._id);
      await reload();
      toast.success(`${person.name} added to the group`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not add member'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title="Group info" icon={Users}>
      <div className="border-b border-border px-4 py-6 text-center">
        {/* Group photo is display-only: the contract has no upload route for it (see P2_INTEGRATION.md). */}
        <div className="flex justify-center">
          <Avatar name={conversation.groupName} src={conversation.groupPicture} size="xl" />
        </div>
        <div className="mt-4">
          {isAdmin ? (
            <NameEditor
              value={conversation.groupName}
              onSave={async (name) => {
                await conversationsApi.updateGroup(id, { groupName: name });
                await reload();
              }}
            />
          ) : (
            <h3 className="text-lg font-bold">{conversation.groupName}</h3>
          )}
          <p className="mt-1 text-sm text-ink-subtle">{members.length} members</p>
        </div>
      </div>

      <section className="px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-wider text-ink-subtle uppercase">Members</h3>
          {isAdmin ? (
            <Button variant={adding ? 'secondary' : 'ghost'} size="sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {adding ? 'Done' : 'Add'}
            </Button>
          ) : null}
        </div>

        {adding ? (
          <div className="mb-4 rounded-xl border border-border p-3 animate-fade-in">
            <UserPicker label="Add a member" onPick={add} excludeIds={memberIds} busyId={busyId} autoFocus />
          </div>
        ) : null}

        <ul className="space-y-1">
          {members.map((m) => {
            const mid = idOf(m);
            const isMe = mid === myId;
            return (
              <MemberRow
                key={mid}
                member={m}
                isMe={isMe}
                isAdminRow={mid === adminId}
                canRemove={isAdmin && !isMe}
                onRemove={() => setRemoving(m)}
                now={now}
              />
            );
          })}
        </ul>
      </section>

      <div className="border-t border-border px-4 py-4">
        <Button variant="ghost" fullWidth className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setLeaving(true)}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Leave group
        </Button>
      </div>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove member?"
        message={removing ? `${removing.name} will no longer see new messages in ${conversation.groupName}.` : ''}
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          await conversationsApi.removeMember(id, idOf(removing));
          await reload();
          toast.success(`${removing.name} removed`);
        }}
      />
      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        title={`Leave ${conversation.groupName}?`}
        message={
          isAdmin
            ? "You're the admin. Another member will become admin when you leave."
            : "You won't receive new messages from this group."
        }
        confirmLabel="Leave group"
        danger
        onConfirm={async () => {
          await conversationsApi.removeMember(id, myId);
          toast.info(`You left ${conversation.groupName}`);
          navigate('/chat', { replace: true });
          await reload();
        }}
      />
    </Drawer>
  );
}
