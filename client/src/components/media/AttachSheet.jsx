import { useEffect, useMemo, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import FileCard from './FileCard.jsx';

const CAPTION_MAX = 1000;

/**
 * Preview before sending a photo or document: thumbnail or file card, optional caption,
 * Send / Cancel. `attachment` = { file, kind: 'image' | 'file', mime } from classifyAttachment.
 * onSend(caption) is called once; the upload itself shows progress in the chat.
 */
export default function AttachSheet({ attachment, onSend, onCancel }) {
  const [caption, setCaption] = useState('');
  const file = attachment?.file;
  const previewUrl = useMemo(() => (file && attachment.kind === 'image' ? URL.createObjectURL(file) : null), [file, attachment?.kind]);

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);
  useEffect(() => setCaption(''), [file]);

  const send = (event) => {
    event?.preventDefault();
    onSend(caption.trim());
  };

  return (
    <Modal
      open={Boolean(file)}
      onClose={onCancel}
      title={attachment?.kind === 'image' ? 'Send photo' : 'Send file'}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={send}>
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
            Send
          </Button>
        </>
      }
    >
      {file ? (
        <form onSubmit={send} className="space-y-4">
          {previewUrl ? (
            <div className="flex justify-center rounded-xl bg-surface-muted p-2">
              <img src={previewUrl} alt={`Preview of ${file.name}`} className="max-h-72 rounded-lg object-contain" />
            </div>
          ) : (
            <FileCard message={{ fileName: file.name, fileSize: file.size, mimeType: attachment.mime }} />
          )}
          <Input
            label="Caption"
            placeholder="Add a caption (optional)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={CAPTION_MAX}
            autoFocus
          />
        </form>
      ) : null}
    </Modal>
  );
}
