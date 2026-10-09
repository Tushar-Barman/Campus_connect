import { CheckCheck, Clock, Info } from 'lucide-react';
import Drawer from '../ui/Drawer.jsx';
import Avatar from '../ui/Avatar.jsx';
import { formatDayLabel, formatTime } from '../../lib/format.js';
import { idOf, previewText } from '../../lib/conversation.js';

const when = (at) => (at ? `${formatDayLabel(at)}, ${formatTime(at)}` : '');

const receiptOf = (list, userId) => (list ?? []).find((r) => idOf(r.user) === userId);

function PersonRow({ person, at }) {
  return (
    <li className="flex items-center gap-3 px-1 py-2">
      <Avatar name={person.name} src={person.profilePicture} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{person.name}</span>
      {at ? <time dateTime={at} className="shrink-0 text-xs text-ink-subtle">{when(at)}</time> : null}
    </li>
  );
}

function Group({ title, Icon, tone, people, empty }) {
  return (
    <section className="mt-5">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-ink-subtle uppercase">
        <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
        {title} <span className="font-normal">· {people.length}</span>
      </h3>
      {people.length ? (
        <ul className="divide-y divide-border">
          {people.map(({ person, at }) => (
            <PersonRow key={idOf(person)} person={person} at={at} />
          ))}
        </ul>
      ) : (
        <p className="py-2 text-sm text-ink-subtle">{empty}</p>
      )}
    </section>
  );
}

/**
 * Round 2: who has read / received one of your messages. `message` is the live copy from
 * useMessages, so it updates as message_delivered / message_read arrive.
 * The server already hides reads of people with read receipts off (and all reads if you turned yours off).
 */
export default function MessageInfoPanel({ open, onClose, message, conversation, myId, receiptsOff }) {
  if (!message) return <Drawer open={false} onClose={onClose} title="Message info" />;

  const isGroup = conversation.type === 'group';
  const others = conversation.participants.filter((p) => idOf(p) !== myId);
  const rows = others.map((person) => {
    const read = receiptOf(message.readBy, idOf(person));
    const delivered = receiptOf(message.deliveredTo, idOf(person));
    return { person, read: read?.at, delivered: delivered?.at ?? read?.at };
  });
  const readRows = rows.filter((r) => r.read).map((r) => ({ person: r.person, at: r.read }));
  const deliveredRows = rows.filter((r) => !r.read && r.delivered).map((r) => ({ person: r.person, at: r.delivered }));
  const pendingRows = rows.filter((r) => !r.read && !r.delivered).map((r) => ({ person: r.person }));

  return (
    <Drawer open={open} onClose={onClose} title="Message info" icon={Info}>
      <div className="rounded-xl bg-brand-600 px-3.5 py-2 text-sm text-white shadow-sm">
        <p className="line-clamp-4 break-words whitespace-pre-wrap">{previewText(message) || 'Message'}</p>
        <p className="mt-1 text-right text-[11px] text-brand-100">Sent {when(message.createdAt)}</p>
      </div>

      {receiptsOff ? (
        <p className="mt-4 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-ink">
          You turned read receipts off, so you can't see when others read your messages. You can change this on your profile.
        </p>
      ) : null}

      {isGroup ? (
        <>
          <Group title="Read by" Icon={CheckCheck} tone="text-read" people={readRows} empty="Nobody yet." />
          <Group title="Delivered to" Icon={CheckCheck} tone="text-ink-subtle" people={deliveredRows} empty="Nobody waiting to read it." />
          <Group title="Not delivered yet" Icon={Clock} tone="text-ink-subtle" people={pendingRows} empty="Delivered to everyone." />
          <p className="mt-5 text-xs text-ink-subtle">People who turned off read receipts show under "Delivered to".</p>
        </>
      ) : (
        <dl className="mt-5 divide-y divide-border rounded-xl border border-border">
          {[
            { label: 'Read', Icon: CheckCheck, tone: 'text-read', at: rows[0]?.read },
            { label: 'Delivered', Icon: CheckCheck, tone: 'text-ink-subtle', at: rows[0]?.delivered },
          ].map(({ label, Icon, tone, at }) => (
            <div key={label} className="flex items-center gap-3 px-3 py-3">
              <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
              <dt className="flex-1 text-sm font-medium">{label}</dt>
              <dd className="text-sm text-ink-muted">{at ? when(at) : '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </Drawer>
  );
}
