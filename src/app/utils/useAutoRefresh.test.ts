import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoRefresh } from './useAutoRefresh';

interface Deferred {
  promise: Promise<string>;
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}

const deferred = (): Deferred => {
  let resolve!: (value: string) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads on mount and refreshes on the interval', async () => {
    const fetch = vi.fn().mockResolvedValue('first');
    const { result } = renderHook(() => useAutoRefresh(fetch, 10000));

    await act(async () => {});
    expect(result.current.data).toBe('first');
    expect(result.current.lastUpdated).not.toBeNull();

    fetch.mockResolvedValue('second');
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe('second');
  });

  it('ignores a slow response that an explicit load has superseded', async () => {
    const slow = deferred();
    const fetch = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValueOnce('fresh');
    const { result } = renderHook(() => useAutoRefresh(fetch, 10000));

    // Reload while the first request is still in flight.
    act(() => result.current.load());
    await act(async () => {});
    expect(result.current.data).toBe('fresh');

    // The stale first response must not overwrite the newer result.
    await act(async () => slow.resolve('stale'));
    expect(result.current.data).toBe('fresh');
  });

  it('does not stack interval requests while a refresh is already in flight', async () => {
    const slow = deferred();
    const fetch = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValueOnce('second');
    const { result } = renderHook(() => useAutoRefresh(fetch, 10000));

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => slow.resolve('first'));
    expect(result.current.data).toBe('first');

    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => {});
    expect(result.current.data).toBe('second');
  });

  it('keeps the previous error visible until a request settles', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useAutoRefresh(fetch, 10000));

    await act(async () => {});
    expect(result.current.error).toContain('down');

    // While the next request is pending the error remains readable.
    const slow = deferred();
    fetch.mockReturnValueOnce(slow.promise);
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.error).toContain('down');
    expect(result.current.refreshing).toBe(true);

    await act(async () => slow.resolve('recovered'));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('recovered');
  });

  it('clears stale data when the fetch target changes', async () => {
    const firstFetch = vi.fn().mockResolvedValue('first target');
    const next = deferred();
    const nextFetch = vi.fn().mockReturnValue(next.promise);
    const { result, rerender } = renderHook(({ fetch }) => useAutoRefresh(fetch, 10000), {
      initialProps: { fetch: firstFetch },
    });

    await act(async () => {});
    expect(result.current.data).toBe('first target');

    rerender({ fetch: nextFetch });
    expect(result.current.data).toBeNull();
    expect(result.current.refreshing).toBe(true);

    await act(async () => next.resolve('next target'));
    expect(result.current.data).toBe('next target');
  });

  it('stops polling on unmount', async () => {
    const fetch = vi.fn().mockResolvedValue('data');
    const { unmount } = renderHook(() => useAutoRefresh(fetch, 10000));

    await act(async () => {});
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
