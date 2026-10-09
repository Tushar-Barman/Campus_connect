import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ListTodo, RotateCw, Sparkles } from 'lucide-react';
import Drawer from '../ui/Drawer.jsx';
import Button from '../ui/Button.jsx';
import { ErrorState, Skeleton } from '../ui/Feedback.jsx';
import { useChatMemory } from '@p3/hooks/useChatMemory.js';
import { errorText } from '../../lib/conversation.js';
import { formatTime } from '../../lib/format.js';

/** P3 returns arrays of strings; objects ({ text, owner, date }) are accepted too, in case the prompt changes. */
function normalizeItem(item) {
  if (typeof item === 'string') return { text: item };
  if (!item || typeof item !== 'object') return null;
  const text = item.text || item.item || item.title || item.description || item.decision || item.event || '';
  return text ? { text, owner: item.owner || item.assignee || item.who, date: item.date || item.due || item.when } : null;
}

function normalize(raw) {
  const list = (value) => (Array.isArray(value) ? value.map(normalizeItem).filter(Boolean) : []);
  return {
    summary: typeof raw?.summary === 'string' ? raw.summary : '',
    keyDecisions: list(raw?.keyDecisions),
    actionItems: list(raw?.actionItems),
    importantDates: list(raw?.importantDates),
    source: raw?.source,
  };
}


function Section({ icon: Icon, title, items, empty, render }) {
  return (
    <section className="px-4 py-4">
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-ink-subtle uppercase">
        <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        {title}
        {items.length ? <span className="text-ink-subtle">· {items.length}</span> : null}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-ink-subtle">{empty}</p>
      ) : (
        <ul className="space-y-2">{items.map(render)}</ul>
      )}
    </section>
  );
}

function LoadingView() {
  return (
    <div className="space-y-6 px-4 py-5" aria-label="Generating Chat Memory">
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Sparkles className="h-4 w-4 animate-pulse text-accent" aria-hidden="true" />
        Reading the conversation…
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export default function ChatMemoryPanel({ conversationId, open, onClose }) {
  // P3's hook: { memory, loading, error, generate }. Generate when the panel opens (P2 §3).
  const { memory, loading, error, generate } = useChatMemory(conversationId);
  const [generatedAt, setGeneratedAt] = useState(null);

  useEffect(() => {
    if (open && !memory && !loading && !error) generate();
  }, [open, memory, loading, error, generate]);

  useEffect(() => {
    if (memory) setGeneratedAt(new Date().toISOString());
  }, [memory]);

  const data = useMemo(() => (memory ? normalize(memory) : null), [memory]);
  const status = loading ? 'loading' : error ? 'error' : data ? 'ready' : 'loading';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Chat Memory"
      icon={Sparkles}
      footer={
        status === 'ready' ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-subtle">
              Generated at {formatTime(generatedAt)}
              {data.source === 'mock' ? ' · offline mock summary' : ' · AI can make mistakes'}
            </p>
            <Button variant="secondary" size="sm" onClick={generate}>
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </Button>
          </div>
        ) : null
      }
    >
      {status === 'loading' ? <LoadingView /> : null}
      {status === 'error' ? <ErrorState title="No memory yet" message={errorText(error)} onRetry={generate} /> : null}
      {status === 'ready' ? (
        <div className="divide-y divide-border animate-fade-in">
          <section className="px-4 py-4">
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-ink-subtle uppercase">Summary</h3>
            <p className="rounded-xl bg-brand-50 p-3 text-sm leading-relaxed text-ink">
              {data.summary || 'Nothing to summarise yet.'}
            </p>
          </section>
          <Section
            icon={CheckCircle2}
            title="Key decisions"
            items={data.keyDecisions}
            empty="No decisions found."
            render={(d, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span>{d.text}</span>
              </li>
            )}
          />
          <Section
            icon={ListTodo}
            title="Action items"
            items={data.actionItems}
            empty="No action items found."
            render={(a, i) => (
              <li key={i} className="rounded-xl border border-border px-3 py-2 text-sm">
                <p>{a.text}</p>
                {a.owner || a.date ? (
                  <p className="mt-1 text-xs text-ink-subtle">
                    {a.owner ? <>Owner: <span className="font-medium text-ink-muted">{a.owner}</span></> : null}
                    {a.owner && a.date ? ' · ' : null}
                    {a.date ? <>Due: <span className="font-medium text-ink-muted">{a.date}</span></> : null}
                  </p>
                ) : null}
              </li>
            )}
          />
          <Section
            icon={CalendarDays}
            title="Important dates"
            items={data.importantDates}
            empty="No dates found."
            render={(d, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                {d.date ? (
                  <span className="shrink-0 rounded-lg bg-warning-soft px-2 py-1 text-xs font-semibold text-warning-ink">{d.date}</span>
                ) : null}
                <span className="pt-0.5">{d.text}</span>
              </li>
            )}
          />
        </div>
      ) : null}
    </Drawer>
  );
}
