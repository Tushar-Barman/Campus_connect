import { loadConversationForUser, createMessage } from './deps.js';
import { publishMessage } from './notify.js';
import { isObjectId } from './validate.js';

const MAX_TEXT_LENGTH = 4000;
const MAX_CLIENT_ID_LENGTH = 100;

function validate({ conversationId, text, clientId } = {}) {
  if (!isObjectId(conversationId)) return { error: 'Invalid conversation id' };
  if (typeof clientId !== 'string' || !clientId || clientId.length > MAX_CLIENT_ID_LENGTH) {
    return { error: 'Invalid clientId' };
  }
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body || body.length > MAX_TEXT_LENGTH) {
    return { error: `Message must be 1–${MAX_TEXT_LENGTH} characters` };
  }
  return { conversationId, clientId, text: body };
}

// Client-facing errors (HttpError 4xx, e.g. 404 for non-members) pass through;
// anything else is logged and hidden behind a generic message.
function publicError(err) {
  if (err?.status && err.status < 500) return err.message;
  console.error('send_message failed:', err);
  return 'Could not send message';
}

export function registerMessageHandlers(socket) {
  socket.on('send_message', async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      const input = validate(payload);
      if (input.error) return reply({ ok: false, error: input.error });

      const conversation = await loadConversationForUser(input.conversationId, socket.userId);
      const created = await createMessage({
        conversationId: conversation._id,
        senderId: socket.userId,
        messageType: 'text',
        text: input.text,
      });
      const message = await publishMessage(conversation, created, { clientId: input.clientId });
      reply({ ok: true, message });
    } catch (err) {
      reply({ ok: false, error: publicError(err) });
    }
  });
}
