import * as React from 'react';
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  Checkbox,
  ExpandableSection,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';
import {
  ManagedLoginPayload,
  ManagedSession,
  ManagedSessionApiError,
  login as submitManagedLogin,
} from './sessionApi';

type AuthenticatedManagedSession = Extract<ManagedSession, { authenticated: true }>;
type ManagedLoginHints = Omit<ManagedLoginPayload, 'password'>;

interface ManagedLoginFormProps {
  onLogin: (session: AuthenticatedManagedSession) => void;
}

const DEFAULT_PORT = 443;
export const MANAGED_LOGIN_HINTS_KEY = 'softether-vpn-console.managed-login-hints';

interface LoginFailure {
  title: string;
  message: string;
}

const describeLoginFailure = (error: unknown): LoginFailure => {
  if (!(error instanceof ManagedSessionApiError)) {
    return {
      title: 'Console unavailable',
      message: 'The console gateway could not be reached. Check your network connection and try again.',
    };
  }

  if (error.status === 401) {
    return {
      title: 'Login details rejected',
      message: 'Check the administrator password and Virtual Hub, then try again.',
    };
  }
  if (error.status === 400) {
    return {
      title: 'Invalid server details',
      message: 'Review the server address, port, and connection options, then try again.',
    };
  }
  if (error.message.toLowerCase().includes('certificate')) {
    return {
      title: 'Certificate verification failed',
      message:
        'Check the server address and certificate. For a trusted private server, allow self-signed certificates under Advanced connection options.',
    };
  }
  if (error.message.includes('valid response')) {
    return {
      title: 'Unsupported server response',
      message: 'Check that the address and port belong to a compatible SoftEther VPN Server.',
    };
  }
  if (error.status === 502) {
    return {
      title: 'Server unavailable',
      message: 'Check the server address and port, confirm that the server is running, then try again.',
    };
  }

  return { title: 'Login failed', message: error.message };
};

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
  const [advancedOpen, setAdvancedOpen] = React.useState(initialHints?.allowSelfSigned ?? false);
  const [submitted, setSubmitted] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<LoginFailure | null>(null);
  const hostRef = React.useRef<HTMLInputElement>(null);
  const portRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const errorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

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
    setError(null);

    if (!canSubmit) {
      if (!submitting) {
        const firstInvalid = !hostValid ? hostRef.current : !portIsValid ? portRef.current : passwordRef.current;
        firstInvalid?.focus();
      }
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
          setError({ title: 'Login failed', message: 'The console did not create a session. Try again.' });
        }
      })
      .catch((e) => setError(describeLoginFailure(e)))
      .finally(() => setSubmitting(false));
  };

  return (
    <Card className="se-managed-login-card">
      <CardTitle>Server connection</CardTitle>
      <CardBody>
        <Stack hasGutter>
          {error && (
            <StackItem>
              <div id="managed-login-error" ref={errorRef} tabIndex={-1}>
                <Alert variant="danger" title={error.title} isInline isLiveRegion>
                  {error.message}
                </Alert>
              </div>
            </StackItem>
          )}
          <StackItem>
            <Form aria-label="SoftEther server login" onSubmit={handleSubmit} aria-busy={submitting}>
              <div className="se-managed-login__target-fields">
                <FormGroup label="Server host" fieldId="managed-login-host" isRequired>
                  <TextInput
                    id="managed-login-host"
                    name="host"
                    ref={hostRef}
                    value={host}
                    placeholder="vpn.example.com"
                    onChange={(_event, value) => setHost(value)}
                    validated={submitted && !hostValid ? 'error' : 'default'}
                    aria-label="Server host"
                    aria-describedby={submitted && !hostValid ? 'managed-login-host-error' : undefined}
                    aria-invalid={submitted && !hostValid}
                    isDisabled={submitting}
                  />
                  {submitted && !hostValid && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem id="managed-login-host-error" variant="error">
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
                    name="port"
                    ref={portRef}
                    min={1}
                    max={65535}
                    value={port}
                    onChange={(_event, value) => setPort(value)}
                    validated={submitted && !portIsValid ? 'error' : 'default'}
                    aria-label="Port"
                    aria-describedby={submitted && !portIsValid ? 'managed-login-port-error' : undefined}
                    aria-invalid={submitted && !portIsValid}
                    isDisabled={submitting}
                  />
                  {submitted && !portIsValid && (
                    <FormHelperText>
                      <HelperText>
                        <HelperTextItem id="managed-login-port-error" variant="error">
                          Enter a TCP port between 1 and 65535.
                        </HelperTextItem>
                      </HelperText>
                    </FormHelperText>
                  )}
                </FormGroup>
              </div>
              <FormGroup label="Virtual Hub" labelInfo="Optional" fieldId="managed-login-hub">
                <TextInput
                  id="managed-login-hub"
                  name="hub"
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
                  name="password"
                  ref={passwordRef}
                  autoComplete="current-password"
                  value={password}
                  onChange={(_event, value) => setPassword(value)}
                  validated={submitted && !passwordValid ? 'error' : 'default'}
                  aria-label="Password"
                  aria-describedby={submitted && !passwordValid ? 'managed-login-password-error' : undefined}
                  aria-invalid={submitted && !passwordValid}
                  isDisabled={submitting}
                />
                {submitted && !passwordValid && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem id="managed-login-password-error" variant="error">
                        Enter the administrator password.
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
              <ExpandableSection
                isExpanded={advancedOpen}
                toggleText="Advanced connection options"
                onToggle={(_event, expanded) => setAdvancedOpen(expanded)}
              >
                <FormGroup fieldId="managed-login-allow-self-signed">
                  <Checkbox
                    id="managed-login-allow-self-signed"
                    label="Allow a self-signed SoftEther server certificate"
                    isChecked={allowSelfSigned}
                    onChange={(_event, checked) => setAllowSelfSigned(checked)}
                    isDisabled={submitting}
                  />
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        Certificate verification will be disabled. Use this only for a trusted private server.
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </FormGroup>
              </ExpandableSection>
              <FormGroup fieldId="managed-login-remember-server">
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
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>
                      Saves the host, port, Virtual Hub, and certificate preference. The administrator password is
                      never saved. Clear this checkbox to forget the saved details.
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              </FormGroup>
              <ActionGroup>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={submitting}
                  isDisabled={submitting}
                  spinnerAriaValueText="Logging in"
                >
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
