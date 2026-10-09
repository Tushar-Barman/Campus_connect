import { Server } from 'socket.io';
import { verifyToken } from './deps.js';
import { setIO } from './emit.js';
import { registerMessageHandlers } from './messages.js';
import { trackPresence, resetPresence } from './presence.js';
import { registerTypingHandlers } from './typing.js';
import { registerReceiptHandlers, deliverPending } from './receipts.js';

function allowedOrigins() {
  return (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    // Same normalisation as REST CORS (config/env.js): a trailing "/" in CLIENT_URL
    // would otherwise block the socket while REST calls still work.
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

// The user id always comes from the verified JWT, never from the client.
async function authenticate(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) return next(new Error('unauthorized'));

    const payload = await verifyToken(token);
    const userId = payload?.userId ?? payload?.id ?? payload?.sub;
    if (!userId) return next(new Error('unauthorized'));

    socket.userId = String(userId);
    next();
  } catch {
    next(new Error('unauthorized'));
  }
}

export function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins() },
  });

  io.use(authenticate);

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    registerMessageHandlers(socket);
    registerTypingHandlers(socket);
    registerReceiptHandlers(socket);
    trackPresence(socket);
    deliverPending(socket).catch((err) => console.error('delivering pending messages failed:', err));
  });

  setIO(io);
  resetPresence().catch((err) => console.error('resetting presence failed:', err));
  return io;
}
