import * as React from "react";
import {
  Alert,
  AlertActionCloseButton,
  AlertGroup,
  Bullseye,
  Content,
  Spinner,
  Stack,
  StackItem,
} from "@patternfly/react-core";
import { ManagedLoginForm } from "./ManagedLoginForm";
import { connectionId, forgetPosition, openConnection } from "./connection";
import { directoryPrefix, indexConnection } from "./connectionDirectory";
import { ConnectionSwitcher } from "./ConnectionSwitcher";
import { ManagedSession, getSession, logout } from "./sessionApi";
import logo from "@app/bgimages/icons8-softether-vpn.svg";
import { AppearanceMenu } from "@app/components/AppearanceMenu";
import "./ManagedSessionGate.css";

type AuthenticatedManagedSession = Extract<ManagedSession, { authenticated: true }>;

interface ManagedSessionGateProps {
  children: React.ReactNode;
}

interface ManagedSessionControls {
  current: AuthenticatedManagedSession;
  expired: () => void;
  isLoggingOut: boolean;
  logout: () => void;
}

const ManagedSessionContext = React.createContext<ManagedSessionControls | null>(null);

export const useManagedSession = (): ManagedSessionControls | null =>
  React.useContext(ManagedSessionContext);

const ManagedSessionGate: React.FunctionComponent<ManagedSessionGateProps> = ({ children }) => {
  const [session, setSession] = React.useState<ManagedSession | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [logoutError, setLogoutError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    getSession()
      .then((nextSession) => {
        if (active) {
          if (nextSession.authenticated) indexConnection(nextSession.connectionId, true);
          else if (connectionId) indexConnection(connectionId, false);
          setSession(nextSession);
          setError(null);
        }
      })
      .catch((e) => {
        if (active) {
          setSession({ authenticated: false });
          setError(e instanceof Error ? e.message : String(e));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const handleLogin = (nextSession: AuthenticatedManagedSession) => {
    indexConnection(nextSession.connectionId, true);
    openConnection(nextSession.connectionId);
  };

  const expired = React.useCallback(() => setSession({ authenticated: false }), []);

  const handleLogout = () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    logout()
      .then(() => {
        if (connectionId) indexConnection(connectionId, false);
        setSession({ authenticated: false });
      })
      .catch((e) => setLogoutError(e instanceof Error ? e.message : String(e)))
      .finally(() => setIsLoggingOut(false));
  };

  React.useEffect(() => {
    if (!session?.authenticated) return;
    let live = true;
    const removed = (event: StorageEvent) => {
      if (event.key !== directoryPrefix + session.connectionId || event.newValue !== null) return;
      void getSession()
        .then((next) => {
          if (live && !next.authenticated) {
            forgetPosition(session.connectionId);
            setSession(next);
          }
        })
        .catch(() => {
          /* A storage notification is not proof of logout. */
        });
    };
    window.addEventListener("storage", removed);
    return () => {
      live = false;
      window.removeEventListener("storage", removed);
    };
  }, [session]);

  if (session === null) {
    return (
      <Bullseye>
        <Spinner size="xl" aria-label="Loading managed session" />
      </Bullseye>
    );
  }

  if (!session.authenticated) {
    return (
      <div className="se-managed-login">
        <header className="se-managed-login__bar">
          <div className="se-managed-login__brand">
            <img src={logo} className="se-managed-login__logo" alt="" />
            <span className="se-managed-login__brand-text">
              <strong>SoftEther</strong>
              <span>VPN Console</span>
            </span>
          </div>
          <p className="se-managed-login__intro">Server and Virtual Hub administration</p>
          <AppearanceMenu className="se-managed-login__appearance" />
        </header>
        <main className="se-managed-login__panel">
          <div className="se-managed-login__heading">
            <Content component="h1">Connect to server</Content>
            <ConnectionSwitcher />
          </div>
          <Stack hasGutter>
            {error && (
              <StackItem>
                <Alert variant="danger" title="Could not load managed session" isInline>
                  {error}
                </Alert>
              </StackItem>
            )}
            <StackItem>
              <ManagedLoginForm onLogin={handleLogin} />
            </StackItem>
          </Stack>
        </main>
      </div>
    );
  }

  return (
    <ManagedSessionContext.Provider
      value={{ current: session, expired, isLoggingOut, logout: handleLogout }}
    >
      {logoutError && (
        <AlertGroup isToast isLiveRegion>
          <Alert
            variant="danger"
            title="Could not log out"
            actionClose={
              <AlertActionCloseButton
                aria-label="Dismiss logout error"
                onClose={() => setLogoutError(null)}
              />
            }
          >
            {logoutError}
          </Alert>
        </AlertGroup>
      )}
      {children}
    </ManagedSessionContext.Provider>
  );
};

export { ManagedSessionGate };
