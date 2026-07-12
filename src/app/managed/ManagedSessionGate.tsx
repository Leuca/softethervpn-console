import * as React from 'react';
import { Alert, Bullseye, Content, Spinner, Stack, StackItem } from '@patternfly/react-core';
import { ManagedLoginForm } from './ManagedLoginForm';
import { ManagedSession, getSession } from './sessionApi';
import './ManagedSessionGate.css';

type AuthenticatedManagedSession = Extract<ManagedSession, { authenticated: true }>;

interface ManagedSessionGateProps {
  children: React.ReactNode;
}

const ManagedSessionGate: React.FunctionComponent<ManagedSessionGateProps> = ({ children }) => {
  const [session, setSession] = React.useState<ManagedSession | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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

  return <>{children}</>;
};

export { ManagedSessionGate };
