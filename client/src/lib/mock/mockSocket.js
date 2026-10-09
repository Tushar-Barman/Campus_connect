// Minimal stand-in for a socket.io-client Socket (mock mode only).
// Same surface the app uses: on, off, emit(event, payload, ack), connect, disconnect, connected.
// Event names and payloads follow PROJECT_INSTRUCTIONS §7.

import * as server from './mockServer.js';

const NETWORK_MS = 80;

export function createMockSocket(token) {
  const handlers = new Map();
  let me = null;
  let unsubscribe = null;
  let manuallyClosed = false;

  const fire = (event, ...args) => {
    (handlers.get(event) || new Set()).forEach((fn) => fn(...args));
  };

  const socket = {
    connected: false,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(fn);
      return socket;
    },
    off(event, fn) {
      if (fn) handlers.get(event)?.delete(fn);
      else handlers.delete(event);
      return socket;
    },
    removeAllListeners() {
      handlers.clear();
      return socket;
    },
    connect() {
      manuallyClosed = false;
      setTimeout(open, 250);
      return socket;
    },
    disconnect() {
      manuallyClosed = true;
      close('io client disconnect');
      return socket;
    },
    emit(event, payload, ack) {
      if (!socket.connected) return socket;
      setTimeout(() => handleClientEvent(event, payload || {}, ack), NETWORK_MS);
      return socket;
    },
    /** Test helper: simulates a dropped connection that recovers after `ms`. */
    simulateDrop(ms = 4000) {
      close('transport close');
      setTimeout(() => {
        if (!manuallyClosed) open();
      }, ms);
    },
  };

  function open() {
    if (socket.connected) return;
    me = server.userFromToken(token);
    if (!me) {
      fire('connect_error', new Error('Unauthorized'));
      return;
    }
    socket.connected = true;
    unsubscribe = server.subscribe((userId, event, payload) => {
      if (socket.connected && userId === me._id) setTimeout(() => fire(event, payload), NETWORK_MS);
    });
    server.socketConnected(me._id);
    fire('connect');
  }

  function close(reason) {
    if (!socket.connected) return;
    socket.connected = false;
    unsubscribe?.();
    unsubscribe = null;
    server.socketDisconnected(me._id);
    fire('disconnect', reason);
  }

  function handleClientEvent(event, payload, ack) {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      switch (event) {
        case 'send_message': {
          const message = server.createMessage(me._id, payload.conversationId, payload.text, payload.clientId);
          reply({ ok: true, message });
          break;
        }
        case 'typing':
          server.relayTyping(me._id, payload.conversationId, true);
          break;
        case 'stop_typing':
          server.relayTyping(me._id, payload.conversationId, false);
          break;
        case 'message_delivered':
          server.markDelivered(me._id, [payload.messageId]);
          break;
        case 'message_read':
          server.markRead(me._id, payload.conversationId);
          break;
        default:
          reply({ ok: false, error: `Unknown event ${event}` });
      }
    } catch (error) {
      reply({ ok: false, error: error.message || 'Mock server error' });
    }
  }

  socket.connect();
  return socket;
}
