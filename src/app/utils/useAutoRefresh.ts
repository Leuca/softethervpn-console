import * as React from 'react';

export interface AutoRefreshState<T> {
  /** Latest fetch result; null until the first request settles. */
  data: T | null;
  /** Latest fetch failure; cleared by the next successful fetch. */
  error: string | null;
  /** A request is currently in flight. */
  refreshing: boolean;
  /** When data last changed. */
  lastUpdated: Date | null;
  /** Trigger an immediate reload (also called on mount and every interval). */
  load: () => void;
}

/**
 * Polls fetch() on an interval, keeping the previous data visible while a
 * request is in flight. Responses are sequence-guarded: only the most
 * recently started request may update state, so a slow refresh cannot
 * overwrite the result of a newer one (an action-triggered reload, or a
 * fetch retargeted at another hub). The error is only replaced when a
 * request settles, not cleared up front, so a visible message stays
 * readable through the next refresh.
 */
export function useAutoRefresh<T>(fetch: () => Promise<T>, intervalMs = 10000): AutoRefreshState<T> {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const seq = React.useRef(0);
  const inFlight = React.useRef(false);

  const load = React.useCallback((force = true) => {
    if (!force && inFlight.current) {
      return;
    }
    const id = ++seq.current;
    inFlight.current = true;
    setRefreshing(true);
    fetch()
      .then((result) => {
        if (id === seq.current) {
          setData(result);
          setError(null);
          setLastUpdated(new Date());
        }
      })
      .catch((e) => {
        if (id === seq.current) {
          setError(String(e));
        }
      })
      .finally(() => {
        if (id === seq.current) {
          inFlight.current = false;
          setRefreshing(false);
        }
      });
  }, [fetch]);

  React.useEffect(() => {
    // A new fetch callback represents a new data target (for example, another
    // Virtual Hub). Do not show the previous target's values while it loads.
    seq.current += 1;
    inFlight.current = false;
    setData(null);
    setError(null);
    setRefreshing(false);
    setLastUpdated(null);
    load();
    const timer = window.setInterval(() => load(false), intervalMs);
    return () => {
      window.clearInterval(timer);
      seq.current += 1;
      inFlight.current = false;
    };
  }, [load, intervalMs]);

  return { data, error, refreshing, lastUpdated, load };
}
