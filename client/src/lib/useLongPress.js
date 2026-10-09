import { useCallback, useEffect, useRef } from 'react';

const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * Touch-only long press (mouse users have the ⋮ button and right-click is left alone).
 * Spread the returned handlers on the element. Cancels if the finger moves (scrolling).
 */
export function useLongPress(onLongPress) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const callbackRef = useRef(onLongPress);
  callbackRef.current = onLongPress;

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const onTouchStart = useCallback(
    (event) => {
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY };
      fired.current = false;
      cancel();
      timer.current = setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(10);
        callbackRef.current?.();
      }, HOLD_MS);
    },
    [cancel],
  );

  const onTouchMove = useCallback(
    (event) => {
      const touch = event.touches[0];
      if (!start.current) return;
      if (Math.hypot(touch.clientX - start.current.x, touch.clientY - start.current.y) > MOVE_TOLERANCE_PX) cancel();
    },
    [cancel],
  );

  // Stop the browser's own long-press menu (copy/share) after ours opened.
  const onContextMenu = useCallback((event) => {
    if (fired.current) event.preventDefault();
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd: cancel, onTouchCancel: cancel, onContextMenu };
}
