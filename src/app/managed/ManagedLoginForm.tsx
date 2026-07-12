import * as React from 'react';
import {
  ActionGroup,
  Alert,
  Button,
  Card,
  CardBody,
  Checkbox,
  Content,
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

interface ManagedLoginFormProps {
  onLogin: (session: AuthenticatedManagedSession) => void;
}

const DEFAULT_PORT = 443;

const parsePort = (port: string): number => Number(port);

const validPort = (port: number): boolean => Number.isInteger(port) && port >= 1 && port <= 65535;

const ManagedLoginForm: React.FunctionComponent<ManagedLoginFormProps> = ({ onLogin }) => {
  const [host, setHost] = React.useState('');
  const [port, setPort] = React.useState(String(DEFAULT_PORT));
  const [hub, setHub] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [allowSelfSigned, setAllowSelfSigned] = React.useState(false);
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
          onLogin(session);
        } else {
          setError('Login did not create an authenticated session.');
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSubmitting(false));
  };

  return (
    <Card>
      <CardBody>
        <Stack hasGutter>
          <StackItem>
            <Content component="p">
              Choose the SoftEther VPN Server this managed console should control. The password is sent only to the
              managed server login endpoint.
            </Content>
          </StackItem>
          {error && (
            <StackItem>
              <Alert variant="danger" title="Login failed" isInline>
                {error}
              </Alert>
            </StackItem>
          )}
          <StackItem>
            <Form onSubmit={handleSubmit}>
              <FormGroup label="Server host" fieldId="managed-login-host" isRequired>
                <TextInput
                  id="managed-login-host"
                  value={host}
                  onChange={(_event, value) => setHost(value)}
                  validated={submitted && !hostValid ? 'error' : 'default'}
                  aria-label="Server host"
                  isDisabled={submitting}
                />
                {submitted && !hostValid && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">Enter the SoftEther server host name or IP address.</HelperTextItem>
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
              <FormGroup label="Virtual Hub" fieldId="managed-login-hub">
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
