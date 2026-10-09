export default function TypingIndicator({ label }) {
  return (
    <div className="mt-3 flex items-center gap-2 animate-fade-in" role="status">
      <span className="flex items-center gap-1 rounded-bubble rounded-bl-md bg-surface px-3.5 py-3 shadow-sm" aria-hidden="true">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-subtle"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span className="text-xs text-ink-subtle">{label}</span>
    </div>
  );
}
