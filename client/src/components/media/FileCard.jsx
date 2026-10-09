import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, FileType2, Presentation } from 'lucide-react';
import { DOCUMENT_TYPES, formatBytes } from '../../lib/media.js';

const ICONS = { pdf: FileText, docx: FileType2, xlsx: FileSpreadsheet, pptx: Presentation, txt: FileText };

/**
 * A shared document: type icon, name, size and a download link.
 * Cloudinary can refuse PDF delivery on free accounts until it's enabled in its settings,
 * so the link is checked when clicked and a friendly note is shown if it fails.
 */
export default function FileCard({ message, mine }) {
  const [problem, setProblem] = useState('');
  const meta = DOCUMENT_TYPES[message.mimeType] ?? { ext: 'file', label: 'File' };
  const Icon = ICONS[meta.ext] ?? FileText;
  const uploading = !message._id;
  const href = message.mediaUrl;

  const check = () => {
    setProblem('');
    // The link opens normally; this only decides whether to show the note.
    fetch(href, { method: 'HEAD' })
      .then((res) => {
        if (res.ok) return;
        setProblem(
          res.status === 401 || res.status === 403
            ? 'File downloads are switched off on this server. (Admin: Cloudinary → Settings → Security → allow delivery of PDF and ZIP files.)'
            : "This file can't be opened right now. Ask the sender to share it again.",
        );
      })
      .catch(() => setProblem("Couldn't reach the file. Check your connection and try again."));
  };

  const body = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${mine ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-700'}`}
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold" title={message.fileName}>
          {message.fileName || 'Document'}
        </span>
        <span className={`block text-xs ${mine ? 'text-on-accent-muted' : 'text-ink-subtle'}`}>
          {meta.label} · {formatBytes(message.fileSize)}
        </span>
      </span>
      {uploading ? null : <Download className="h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />}
    </>
  );

  const box = `flex w-60 max-w-full items-center gap-3 rounded-xl p-2 ${mine ? 'bg-white/10' : 'bg-surface-muted'}`;

  return (
    <div className="-mx-1.5 -mt-0.5">
      {uploading || !href ? (
        <div className={box}>{body}</div>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={check}
          className={`${box} transition-opacity hover:opacity-90`}
          aria-label={`Open ${message.fileName || 'document'} (${meta.label}, ${formatBytes(message.fileSize)})`}
        >
          {body}
        </a>
      )}
      {problem ? (
        <p className={`mt-1 text-xs ${mine ? 'text-white' : 'text-danger'}`} role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
