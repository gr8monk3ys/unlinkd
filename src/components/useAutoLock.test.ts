import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAutoLock } from './useAutoLock';

describe('useAutoLock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onLock after the timeout when enabled', () => {
    const onLock = vi.fn();
    renderHook(() => useAutoLock(true, onLock, 1000));

    vi.advanceTimersByTime(999);
    expect(onLock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', () => {
    const onLock = vi.fn();
    renderHook(() => useAutoLock(false, onLock, 1000));

    vi.advanceTimersByTime(5000);
    expect(onLock).not.toHaveBeenCalled();
  });

  it('resets the timer on user activity', () => {
    const onLock = vi.fn();
    renderHook(() => useAutoLock(true, onLock, 1000));

    vi.advanceTimersByTime(900);
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(900);
    expect(onLock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('stops firing after unmount', () => {
    const onLock = vi.fn();
    const { unmount } = renderHook(() => useAutoLock(true, onLock, 1000));

    unmount();
    vi.advanceTimersByTime(5000);
    expect(onLock).not.toHaveBeenCalled();
  });

  it('stops the pending timer when enabled flips to false', () => {
    const onLock = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useAutoLock(enabled, onLock, 1000), {
      initialProps: { enabled: true }
    });

    vi.advanceTimersByTime(500);
    rerender({ enabled: false });
    vi.advanceTimersByTime(5000);
    expect(onLock).not.toHaveBeenCalled();
  });
});
