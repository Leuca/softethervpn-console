import * as React from "react";

export interface TransitionRefreshOptions {
  intervalMs?: number;
  maxAttempts?: number;
  onError?: (error: string) => void;
}

/**
 * Runs a bounded refresh loop for asynchronous state transitions. A new
 * non-null key starts a loop; changing or clearing the key cancels it.
 * Requests never overlap, and polling pauses while the document is hidden.
 */
export function useTransitionRefresh(
  key: string | null,
  refresh: () => Promise<boolean>,
  { intervalMs = 1000, maxAttempts = 30, onError }: TransitionRefreshOptions = {},
): void {
  const refreshRef = React.useRef(refresh);
  const onErrorRef = React.useRef(onError);
  refreshRef.current = refresh;
  onErrorRef.current = onError;

  React.useEffect(() => {
    if (key === null) {
      return undefined;
    }

    let attempts = 0;
    let cancelled = false;
    let inFlight = false;
    let timer: number | null = null;

    const schedule = () => {
      if (cancelled || inFlight || timer !== null || attempts >= maxAttempts) {
        return;
      }
      timer = window.setTimeout(run, intervalMs);
    };

    const run = () => {
      timer = null;
      if (cancelled) {
        return;
      }
      if (document.visibilityState === "hidden") {
        return;
      }

      attempts += 1;
      inFlight = true;
      refreshRef
        .current()
        .then((complete) => {
          inFlight = false;
          if (!cancelled && !complete) {
            schedule();
          }
        })
        .catch((error) => {
          inFlight = false;
          if (!cancelled) {
            onErrorRef.current?.(String(error));
            schedule();
          }
        });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        schedule();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule();

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [intervalMs, key, maxAttempts]);
}
