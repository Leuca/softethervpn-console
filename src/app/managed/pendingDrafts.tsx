import * as React from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
} from "@patternfly/react-core";

type DraftCheck = () => boolean;
const DraftContext = React.createContext<Set<DraftCheck> | null>(null);
const LeaveContext = React.createContext<(action: () => void, editor?: DraftCheck) => void>(
  (action) => action(),
);
export const useGuardedAction = () => React.useContext(LeaveContext);
const ConnectionLinkContext = React.createContext<(event: React.MouseEvent) => void>(() => {});
export const useConnectionLinkGuard = () => React.useContext(ConnectionLinkContext);

export function DiscardDialog({ stay, discard }: { stay: () => void; discard: () => void }) {
  const id = React.useId();
  // PatternFly modals each handle Escape on document.body; never stack two of them.
  const [overModal] = React.useState(() => !!document.querySelector('[aria-modal="true"]'));
  const answered = React.useRef(false);
  React.useEffect(() => {
    if (overModal && !answered.current) {
      answered.current = true;
      if (window.confirm("Leave this page and discard unsaved changes?")) discard();
      else stay();
    }
  }, [overModal, stay, discard]);
  if (overModal) return null;
  return (
    <Modal
      isOpen
      variant={ModalVariant.small}
      onClose={stay}
      elementToFocus="[data-keep-editing]"
      aria-labelledby={id}
      aria-describedby={id + "-body"}
    >
      <ModalHeader title="Discard unsaved changes?" titleIconVariant="warning" labelId={id} />
      <ModalBody id={id + "-body"}>Your edits have not been saved to the server.</ModalBody>
      <ModalFooter>
        <Button variant="primary" data-keep-editing onClick={stay}>
          Keep editing
        </Button>
        <Button variant="secondary" isDanger onClick={discard}>
          Discard changes
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export function PendingDraftsProvider({ children }: React.PropsWithChildren) {
  const [checks] = React.useState(() => new Set<DraftCheck>());
  const [action, setAction] = React.useState<(() => void) | null>(null);
  const approvedLeave = React.useRef(false);
  const guardLink = (event: React.MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (!Array.from(checks).some((check) => check())) return;
    if (window.confirm("Leave this page and discard unsaved changes?"))
      approvedLeave.current = true;
    else event.preventDefault();
  };
  const guard = (next: () => void, editor?: DraftCheck) => {
    // Inside a modal, avoid stacking a second PatternFly focus trap over its editor.
    if (editor) {
      if (!editor() || window.confirm("Discard unsaved changes in this editor?")) next();
      return;
    }
    if (Array.from(checks).some((check) => check())) setAction(() => next);
    else next();
  };
  React.useEffect(() => {
    const resetApproval = () => {
      approvedLeave.current = false;
    };
    const leaving = (event: BeforeUnloadEvent) => {
      if (approvedLeave.current) {
        resetApproval();
        return;
      }
      if (Array.from(checks).some((check) => check())) {
        event.preventDefault();
        event.returnValue = true;
      }
    };
    window.addEventListener("beforeunload", leaving);
    window.addEventListener("pageshow", resetApproval);
    return () => {
      window.removeEventListener("beforeunload", leaving);
      window.removeEventListener("pageshow", resetApproval);
    };
  }, [checks]);
  return (
    <DraftContext.Provider value={checks}>
      <LeaveContext.Provider value={guard}>
        <ConnectionLinkContext.Provider value={guardLink}>
          {children}
        </ConnectionLinkContext.Provider>
        {action && (
          <DiscardDialog
            stay={() => setAction(null)}
            discard={() => {
              setAction(null);
              action();
            }}
          />
        )}
      </LeaveContext.Provider>
    </DraftContext.Provider>
  );
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

// Capture the immutable draft when its editor opens (after any initial fetch).
// Keeping the reference avoids copying sensitive fields on every keystroke.
export function useEditorDismiss(open: boolean, value: unknown, close: () => void) {
  const original = React.useRef<unknown>();
  const wasOpen = React.useRef(false);
  React.useLayoutEffect(() => {
    if (open && !wasOpen.current) original.current = value;
    if (!open) original.current = undefined;
    wasOpen.current = open;
  }, [open, value]);
  const dirty = () =>
    open &&
    original.current !== value &&
    JSON.stringify(original.current) !== JSON.stringify(value);
  usePendingDraft(dirty);
  const guard = useGuardedAction();
  return () => guard(close, dirty);
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
