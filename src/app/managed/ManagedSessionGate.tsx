import * as React from 'react';
import {
  Alert,
  AlertActionCloseButton,
  AlertGroup,
  Bullseye,
  Content,
  Spinner,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { ManagedLoginForm } from './ManagedLoginForm';
import { ManagedSession, getSession, logout } from './sessionApi';
import './ManagedSessionGate.css';

type AuthenticatedManagedSession = Extract<ManagedSession, { authenticated: true }>;

interface ManagedSessionGateProps {
  children: React.ReactNode;
}

interface ManagedSessionControls {
  isLoggingOut: boolean;
  logout: () => void;
}

const ManagedSessionContext = React.createContext<ManagedSessionControls | null>(null);

export const useManagedSession = (): ManagedSessionControls | null => React.useContext(ManagedSessionContext);

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
    setSession(nextSession);
    setError(null);
  };

  const handleLogout = () => {
    setIsLoggingOut(true);
    setLogoutError(null);
    logout()
      .then(() => setSession({ authenticated: false }))
      .catch((e) => setLogoutError(e instanceof Error ? e.message : String(e)))
      .finally(() => setIsLoggingOut(false));
  };

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
        <div className="se-managed-login__panel">
          <div className="se-managed-login__intro">
            <Content component="h1">Connect to SoftEther VPN Server</Content>
            <Content component="p">
              Choose the server to manage. Your administrator password is used only to open this secure session.
            </Content>
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
        </div>
      </div>
    );
  }

  return (
    <ManagedSessionContext.Provider value={{ isLoggingOut, logout: handleLogout }}>
      {logoutError && (
        <AlertGroup isToast isLiveRegion>
          <Alert
            variant="danger"
            title="Could not log out"
            actionClose={
              <AlertActionCloseButton aria-label="Dismiss logout error" onClose={() => setLogoutError(null)} />
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
