import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTransitionRefresh } from "./useTransitionRefresh";

interface Deferred {
  promise: Promise<boolean>;
  resolve: (value: boolean) => void;
}

const deferred = (): Deferred => {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("useTransitionRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for each request to settle and stops when the transition completes", async () => {
    const first = deferred();
    const second = deferred();
    const refresh = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    renderHook(() => useTransitionRefresh("link", refresh, { intervalMs: 100, maxAttempts: 5 }));

    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(false);
      await first.promise;
      await Promise.resolve();
    });
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(refresh).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve(true);
      await second.promise;
      await Promise.resolve();
    });
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops after the configured attempt limit", async () => {
    const refresh = vi.fn().mockResolvedValue(false);

    renderHook(() => useTransitionRefresh("link", refresh, { intervalMs: 100, maxAttempts: 3 }));

    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("cancels pending refreshes when the key is cleared", async () => {
    const refresh = vi.fn().mockResolvedValue(false);
    const { rerender } = renderHook(
      ({ transitionKey }) => useTransitionRefresh(transitionKey, refresh, { intervalMs: 100 }),
      { initialProps: { transitionKey: "link" as string | null } },
    );

    rerender({ transitionKey: null });
    await act(() => vi.advanceTimersByTimeAsync(500));

    expect(refresh).not.toHaveBeenCalled();
  });

  it("pauses while hidden and resumes when the document is visible", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const refresh = vi.fn().mockResolvedValue(true);

    renderHook(() => useTransitionRefresh("link", refresh, { intervalMs: 100 }));

    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(refresh).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(refresh).toHaveBeenCalledOnce();
  });
});
