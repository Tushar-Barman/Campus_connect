import { useCallback, useEffect, useRef, useState } from 'react';

const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 10;
const SWIPE_TRIGGER_PX = 56;
const SWIPE_MAX_PX = 72;

/**
 * Touch gestures on a message bubble (mouse users have the ⋮ menu and double-click):
 *   long press   → onLongPress (opens the menu)
 *   swipe right  → onSwipeRight (reply), with the bubble following the finger
 * Spread `handlers` on the element and apply `offset` as translateX.
 */
export function useBubbleGestures({ onLongPress, onSwipeRight }) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const timer = useRef(null);
  const start = useRef(null);
  const mode = useRef(null); // null | 'swipe' | 'scroll'
  const fired = useRef(false);
  const callbacks = useRef({ onLongPress, onSwipeRight });
  callbacks.current = { onLongPress, onSwipeRight };

  const cancelHold = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancelHold, [cancelHold]);

  const onTouchStart = useCallback(
    (event) => {
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY };
      mode.current = null;
      fired.current = false;
      cancelHold();
      if (!callbacks.current.onLongPress) return;
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        callbacks.current.onLongPress?.();
      }, HOLD_MS);
    },
    [cancelHold],
  );

  const onTouchMove = useCallback(
    (event) => {
      if (!start.current) return;
      const touch = event.touches[0];
      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) cancelHold();
      if (mode.current === null && Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) {
        mode.current = callbacks.current.onSwipeRight && dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5 ? 'swipe' : 'scroll';
      }
      if (mode.current === 'swipe') {
        offsetRef.current = Math.max(0, Math.min(dx, SWIPE_MAX_PX));
        setOffset(offsetRef.current);
      }
    },
    [cancelHold],
  );

  const onTouchEnd = useCallback(() => {
    cancelHold();
    if (mode.current === 'swipe') {
      if (offsetRef.current >= SWIPE_TRIGGER_PX) {
        navigator.vibrate?.(10);
        callbacks.current.onSwipeRight?.();
      }
      offsetRef.current = 0;
      setOffset(0);
    }
    mode.current = null;
    start.current = null;
  }, [cancelHold]);

  // Stop the browser's own long-press menu (copy/share) after ours opened.
  const onContextMenu = useCallback((event) => {
    if (fired.current) event.preventDefault();
  }, []);

  return {
    offset,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd, onContextMenu },
  };
}
