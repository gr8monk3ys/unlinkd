import { useEffect, useRef } from 'react';

/** Lock the vault after this long without user activity. */
export const AUTO_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Calls `onLock` after `timeoutMs` of user inactivity while `enabled` is true.
 * Any pointer, key, wheel, or touch activity resets the timer.
 */
export function useAutoLock(enabled: boolean, onLock: () => void, timeoutMs: number = AUTO_LOCK_TIMEOUT_MS): void {
  const onLockRef = useRef(onLock);

  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let timer = window.setTimeout(fire, timeoutMs);

    function fire(): void {
      onLockRef.current();
    }

    function reset(): void {
      window.clearTimeout(timer);
      timer = window.setTimeout(fire, timeoutMs);
    }

    ACTIVITY_EVENTS.forEach((eventName) => window.addEventListener(eventName, reset, { passive: true }));

    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, reset));
    };
  }, [enabled, timeoutMs]);
}
