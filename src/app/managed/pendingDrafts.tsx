import * as React from "react";

type DraftCheck = () => boolean;
const DraftContext = React.createContext<Set<DraftCheck> | null>(null);

export function PendingDraftsProvider({ children }: React.PropsWithChildren) {
  const [checks] = React.useState(() => new Set<DraftCheck>());
  return <DraftContext.Provider value={checks}>{children}</DraftContext.Provider>;
}

// Ask mounted editors only when navigating, including uncontrolled or autofilled fields.
export function usePendingDraft(check: DraftCheck) {
  const checks = React.useContext(DraftContext);
  React.useLayoutEffect(() => {
    if (!checks) return;
    checks.add(check);
    return () => {
      checks.delete(check);
    };
  }, [checks, check]);
}

export function useHasPendingDrafts() {
  const checks = React.useContext(DraftContext);
  return () => !!checks && Array.from(checks).some((check) => check());
}

// Settings drafts are JSON-shaped RPC data. Compare on navigation, not each keystroke.
export function useDraftBaseline<T>(value: T) {
  const saved = React.useRef(value);
  usePendingDraft(
    () => value !== saved.current && JSON.stringify(value) !== JSON.stringify(saved.current),
  );
  return React.useCallback((next: T) => {
    saved.current = next;
  }, []);
}

export function useDraftState<T>(initial: T) {
  const [value, setValue] = React.useState(initial);
  const markSaved = useDraftBaseline(value);
  const reset = React.useCallback(
    (next: T) => {
      markSaved(next);
      setValue(next);
    },
    [markSaved],
  );
  return [value, setValue, reset, markSaved] as const;
}
