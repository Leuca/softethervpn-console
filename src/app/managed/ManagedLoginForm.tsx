import * as React from 'react';
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Checkbox,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';
import { ManagedLoginPayload, ManagedSession, login as submitManagedLogin } from './sessionApi';

type AuthenticatedManagedSession = Extract<ManagedSession, { authenticated: true }>;
type ManagedLoginHints = Omit<ManagedLoginPayload, 'password'>;

interface ManagedLoginFormProps {
  onLogin: (session: AuthenticatedManagedSession) => void;
}

const DEFAULT_PORT = 443;
export const MANAGED_LOGIN_HINTS_KEY = 'softether-vpn-console.managed-login-hints';

const parsePort = (port: string): number => Number(port);

const validPort = (port: number): boolean => Number.isInteger(port) && port >= 1 && port <= 65535;

const loadLoginHints = (): ManagedLoginHints | null => {
  try {
    const value = JSON.parse(window.localStorage.getItem(MANAGED_LOGIN_HINTS_KEY) ?? 'null') as Partial<ManagedLoginHints> | null;
    if (
      !value ||
      typeof value.host !== 'string' ||
      !validPort(value.port ?? 0) ||
      typeof value.hub !== 'string' ||
      typeof value.allowSelfSigned !== 'boolean'
    ) {
      return null;
    }
    return value as ManagedLoginHints;
  } catch {
    return null;
  }
};

const saveLoginHints = ({ host, port, hub, allowSelfSigned }: ManagedLoginPayload): void => {
  try {
    window.localStorage.setItem(MANAGED_LOGIN_HINTS_KEY, JSON.stringify({ host, port, hub, allowSelfSigned }));
  } catch {
    // Browser storage can be unavailable without preventing login.
  }
};

const clearLoginHints = (): void => {
  try {
    window.localStorage.removeItem(MANAGED_LOGIN_HINTS_KEY);
  } catch {
    // Browser storage can be unavailable without preventing login.
  }
};

const ManagedLoginForm: React.FunctionComponent<ManagedLoginFormProps> = ({ onLogin }) => {
  const [initialHints] = React.useState(loadLoginHints);
  const [host, setHost] = React.useState(initialHints?.host ?? '');
  const [port, setPort] = React.useState(String(initialHints?.port ?? DEFAULT_PORT));
  const [hub, setHub] = React.useState(initialHints?.hub ?? '');
  const [password, setPassword] = React.useState('');
  const [allowSelfSigned, setAllowSelfSigned] = React.useState(initialHints?.allowSelfSigned ?? false);
  const [rememberServer, setRememberServer] = React.useState(initialHints !== null);
  const [submitted, setSubmitted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const normalizedHost = host.trim();
  const normalizedHub = hub.trim();
  const portNumber = parsePort(port);
  const hostValid = normalizedHost.length > 0;
  const portIsValid = validPort(portNumber);
  const passwordValid = password.length > 0;
  const canSubmit = hostValid && portIsValid && passwordValid && !submitting;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);

    if (!canSubmit) {
      return;
    }

    const payload: ManagedLoginPayload = {
      host: normalizedHost,
      port: portNumber,
      hub: normalizedHub,
      password,
      allowSelfSigned,
    };

    setSubmitting(true);
    setError(null);
    submitManagedLogin(payload)
      .then((session) => {
        if (session.authenticated) {
          if (rememberServer) {
            saveLoginHints(payload);
          } else {
            clearLoginHints();
          }
          onLogin(session);
        } else {
          setError('Login did not create an authenticated session.');
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSubmitting(false));
  };

  return (
    <Card className="se-managed-login-card">
      <CardTitle>Server connection</CardTitle>
      <CardBody>
        <Stack hasGutter>
          {error && (
            <StackItem>
              <Alert variant="danger" title="Login failed" isInline>
                {error}
              </Alert>
            </StackItem>
          )}
          <StackItem>
            <Form onSubmit={handleSubmit}>
              <div className="se-managed-login__target-fields">
                <FormGroup label="Server host" fieldId="managed-login-host" isRequired>
                  <TextInput
                    id="managed-login-host"
                    value={host}
                    placeholder="vpn.example.com"
                    onChange={(_event, value) => setHost(value)}
                    validated={submitted && !hostValid ? 'error' : 'default'}
                    aria-label="Server host"
                    isDisabled={submitting}
                  />
                  {submitted && !hostValid && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem variant="error">
                          Enter the SoftEther server host name or IP address.
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </FormGroup>
                <FormGroup label="Port" fieldId="managed-login-port" isRequired>
                  <TextInput
                    type="number"
                    id="managed-login-port"
                    min={1}
                    max={65535}
                    value={port}
                    onChange={(_event, value) => setPort(value)}
                    validated={submitted && !portIsValid ? 'error' : 'default'}
                    aria-label="Port"
                    isDisabled={submitting}
                  />
                  {submitted && !portIsValid && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem variant="error">Enter a TCP port between 1 and 65535.</HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </FormGroup>
              </div>
              <FormGroup label="Virtual Hub" labelInfo="Optional" fieldId="managed-login-hub">
                <TextInput
                  id="managed-login-hub"
                  value={hub}
                  onChange={(_event, value) => setHub(value)}
                  aria-label="Virtual Hub"
                  isDisabled={submitting}
                />
              </FormGroup>
              <FormGroup label="Password" fieldId="managed-login-password" isRequired>
                <TextInput
                  type="password"
                  id="managed-login-password"
                  value={password}
                  onChange={(_event, value) => setPassword(value)}
                  validated={submitted && !passwordValid ? 'error' : 'default'}
                  aria-label="Password"
                  isDisabled={submitting}
                />
                {submitted && !passwordValid && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">Enter the administrator password.</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
              <FormGroup fieldId="managed-login-allow-self-signed" label="Upstream TLS">
                <Checkbox
                  id="managed-login-allow-self-signed"
                  label="Allow a self-signed SoftEther server certificate"
                  isChecked={allowSelfSigned}
                  onChange={(_event, checked) => setAllowSelfSigned(checked)}
                  isDisabled={submitting}
                />
              </FormGroup>
              <FormGroup fieldId="managed-login-remember-server" label="Browser preferences">
                <Checkbox
                  id="managed-login-remember-server"
                  label="Remember server details on this browser"
                  isChecked={rememberServer}
                  onChange={(_event, checked) => {
                    setRememberServer(checked);
                    if (!checked) {
                      clearLoginHints();
                    }
                  }}
                  isDisabled={submitting}
                />
              </FormGroup>
              <ActionGroup>
                <Button type="submit" variant="primary" isLoading={submitting} isDisabled={!canSubmit}>
                  Log in
                </Button>
              </ActionGroup>
            </Form>
          </StackItem>
        </Stack>
      </CardBody>
    </Card>
  );
};

export { ManagedLoginForm };
