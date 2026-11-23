import * as React from "react";
import { usePendingDraft } from "@app/managed/pendingDrafts";
import {
  ActionGroup,
  Alert,
  Button,
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
  ToggleGroup,
  ToggleGroupItem,
} from "@patternfly/react-core";
import {
  ManagedLoginPayload,
  ManagedSession,
  ManagedSessionApiError,
  login as submitManagedLogin,
} from "./sessionApi";

type AuthenticatedManagedSession = Extract<ManagedSession, { authenticated: true }>;
type ManagedLoginHints = Omit<ManagedLoginPayload, "password">;

interface ManagedLoginFormProps {
  onLogin: (session: AuthenticatedManagedSession) => void;
}

const DEFAULT_PORT = 443;
export const MANAGED_LOGIN_HINTS_KEY = "softether-vpn-console.managed-login-hints";

interface LoginFailure {
  title: string;
  message: string;
}

const describeLoginFailure = (error: unknown, hubLogin: boolean): LoginFailure => {
  if (!(error instanceof ManagedSessionApiError)) {
    return {
      title: "Console unavailable",
      message:
        "The console gateway could not be reached. Check your network connection and try again.",
    };
  }

  if (error.status === 401) {
    return {
      title: "Login details rejected",
      message: hubLogin
        ? "Check the Virtual Hub name and administrator password, then try again."
        : "Check the server administrator password, then try again.",
    };
  }
  if (error.status === 400) {
    return {
      title: "Invalid server details",
      message: "Review the server address, port, and connection options, then try again.",
    };
  }
  if (error.message.toLowerCase().includes("certificate")) {
    return {
      title: "Certificate verification failed",
      message:
        "Check the server address and certificate. For a trusted private server, allow self-signed certificates under Advanced connection options.",
    };
  }
  if (error.message.includes("valid response")) {
    return {
      title: "Unsupported server response",
      message: "Check that the address and port belong to a compatible SoftEther VPN Server.",
    };
  }
  if (error.status === 502) {
    return {
      title: "Server unavailable",
      message:
        "Check the server address and port, confirm that the server is running, then try again.",
    };
  }

  return { title: "Login failed", message: error.message };
};

const validPort = (port: number): boolean => Number.isInteger(port) && port >= 1 && port <= 65535;

const tlsEndpoint = ({ host, port }: Pick<ManagedLoginPayload, "host" | "port">): string | null =>
  host.trim() && validPort(port) ? `${port}:${host.trim()}` : null;

const loadLoginHints = (): ManagedLoginHints | null => {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(MANAGED_LOGIN_HINTS_KEY) ?? "null",
    ) as Partial<ManagedLoginHints> | null;
    if (
      !value ||
      typeof value.host !== "string" ||
      !validPort(value.port ?? 0) ||
      typeof value.hub !== "string" ||
      typeof value.allowSelfSigned !== "boolean"
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
    window.localStorage.setItem(
      MANAGED_LOGIN_HINTS_KEY,
      JSON.stringify({ host, port, hub, allowSelfSigned }),
    );
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
  const [hubLogin, setHubLogin] = React.useState(Boolean(initialHints?.hub.trim()));
  const [hubDraft, setHubDraft] = React.useState(initialHints?.hub ?? "");
  const rememberedConsent = initialHints?.allowSelfSigned ? tlsEndpoint(initialHints) : null;
  const [consentEndpoint, setConsentEndpoint] = React.useState(rememberedConsent);
  const [rememberServer, setRememberServer] = React.useState(initialHints !== null);
  const [advancedOpen, setAdvancedOpen] = React.useState(initialHints?.allowSelfSigned ?? false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<LoginFailure | null>(null);
  const hostRef = React.useRef<HTMLInputElement>(null);
  const portRef = React.useRef<HTMLInputElement>(null);
  const hubRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);
  const errorRef = React.useRef<HTMLDivElement>(null);
  const loggedIn = React.useRef(false);

  const readLoginFields = () => {
    const host = hostRef.current?.value.trim() ?? "";
    const port = Number(portRef.current?.value);
    const hub = hubLogin ? (hubRef.current?.value.trim() ?? "") : "";
    const password = passwordRef.current?.value ?? "";

    return {
      fields: { host, port, hub, password },
      invalid: { host: !host, port: !validPort(port), hub: hubLogin && !hub, password: !password },
    };
  };
  usePendingDraft(
    () =>
      !loggedIn.current &&
      ((hostRef.current?.value ?? "") !== (initialHints?.host ?? "") ||
        portRef.current?.value !== String(initialHints?.port ?? DEFAULT_PORT) ||
        hubLogin !== Boolean(initialHints?.hub.trim()) ||
        (hubRef.current?.value ?? hubDraft) !== (initialHints?.hub ?? "") ||
        !!passwordRef.current?.value ||
        consentEndpoint !== rememberedConsent),
  );
  const [invalid, setInvalid] = React.useState<
    ReturnType<typeof readLoginFields>["invalid"] | null
  >(null);

  React.useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    setError(null);

    // Password managers can fill the native fields without a React change event.
    const { fields, invalid: invalidFields } = readLoginFields();
    const allowSelfSigned = consentEndpoint !== null && consentEndpoint === tlsEndpoint(fields);
    if (!allowSelfSigned) setConsentEndpoint(null);
    setInvalid(invalidFields);

    const firstInvalid = [
      invalidFields.host && hostRef,
      invalidFields.port && portRef,
      invalidFields.hub && hubRef,
      invalidFields.password && passwordRef,
    ].find(Boolean);
    if (firstInvalid) {
      firstInvalid.current?.focus();
      return;
    }

    const payload: ManagedLoginPayload = { ...fields, allowSelfSigned };
    setSubmitting(true);
    submitManagedLogin(payload)
      .then((session) => {
        if (session.authenticated) {
          if (rememberServer) {
            saveLoginHints(payload);
          } else {
            clearLoginHints();
          }
          loggedIn.current = true;
          onLogin(session);
        } else {
          setError({
            title: "Login failed",
            message: "The console did not create a session. Try again.",
          });
        }
      })
      .catch((e) => setError(describeLoginFailure(e, hubLogin)))
      .finally(() => setSubmitting(false));
  };

  const revalidate = () => {
    const { fields, invalid: invalidFields } = readLoginFields();
    if (consentEndpoint !== null && consentEndpoint !== tlsEndpoint(fields)) {
      setConsentEndpoint(null);
    }
    if (invalid && !submitting) {
      setInvalid(invalidFields);
    }
  };

  const selectScope = (nextHubLogin: boolean) => {
    if (nextHubLogin !== hubLogin) {
      if (hubRef.current) {
        setHubDraft(hubRef.current.value);
      }
      setHubLogin(nextHubLogin);
      setInvalid(null);
      setError(null);
    }
  };

  // iOS AutoFill can mistake the host for a username. Desktop extensions need
  // its custom fields inside the same native form as the password.
  const separateDetails =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const formProps = {
    method: "post",
    onSubmit: handleSubmit,
    onChange: revalidate,
    "aria-busy": submitting,
  };
  const details = (
    <>
      <div className="se-managed-login__target-fields">
        <FormGroup label="Server host" fieldId="managed-login-host" isRequired>
          <TextInput
            id="managed-login-host"
            name="host"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            ref={hostRef}
            defaultValue={initialHints?.host ?? ""}
            placeholder="vpn.example.com"
            validated={invalid?.host ? "error" : "default"}
            aria-label="Server host"
            aria-describedby={invalid?.host ? "managed-login-host-error" : undefined}
            aria-invalid={invalid?.host ?? false}
            isDisabled={submitting}
          />
          {invalid?.host && (
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
            defaultValue={String(initialHints?.port ?? DEFAULT_PORT)}
            validated={invalid?.port ? "error" : "default"}
            aria-label="Port"
            aria-describedby={invalid?.port ? "managed-login-port-error" : undefined}
            aria-invalid={invalid?.port ?? false}
            isDisabled={submitting}
          />
          {invalid?.port && (
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
      <FormGroup label="Administrator scope" fieldId="managed-login-scope" role="group">
        <ToggleGroup role="presentation" areAllGroupsDisabled={submitting}>
          <ToggleGroupItem
            text="Server"
            isSelected={!hubLogin}
            onChange={() => selectScope(false)}
          />
          <ToggleGroupItem
            text="Virtual Hub"
            isSelected={hubLogin}
            onChange={() => selectScope(true)}
          />
        </ToggleGroup>
      </FormGroup>
    </>
  );
  const credentials = (
    <React.Fragment key={hubLogin ? "hub" : "server"}>
      {hubLogin && (
        <FormGroup label="Virtual Hub" fieldId="managed-login-hub" isRequired>
          <TextInput
            id="managed-login-hub"
            name="hub"
            ref={hubRef}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={hubDraft}
            isRequired
            validated={invalid?.hub ? "error" : "default"}
            aria-describedby={invalid?.hub ? "managed-login-hub-error" : undefined}
            aria-invalid={invalid?.hub ?? false}
            isDisabled={submitting}
          />
          {invalid?.hub && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem id="managed-login-hub-error" variant="error">
                  Enter the Virtual Hub name.
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      )}
      <FormGroup label="Password" fieldId="managed-login-password" isRequired>
        <TextInput
          type="password"
          id="managed-login-password"
          name="password"
          ref={passwordRef}
          autoComplete="current-password"
          validated={invalid?.password ? "error" : "default"}
          aria-label="Password"
          aria-describedby={invalid?.password ? "managed-login-password-error" : undefined}
          aria-invalid={invalid?.password ?? false}
          isDisabled={submitting}
        />
        {invalid?.password && (
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
            isChecked={consentEndpoint !== null}
            onChange={(_event, checked) => {
              const endpoint = checked ? tlsEndpoint(readLoginFields().fields) : null;
              setConsentEndpoint(endpoint);
              if (checked && endpoint === null) {
                setError({
                  title: "Server details required",
                  message: "Enter a server host and valid port before allowing an exception.",
                });
              }
            }}
            isDisabled={submitting}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                This disables certificate verification for the current host and port. Use it only
                for a trusted private server.
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
              Saves the host, port, Virtual Hub, and certificate preference, but not your password.
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
    </React.Fragment>
  );
  return (
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
      {separateDetails && (
        <StackItem>
          <Form {...formProps} aria-label="SoftEther server details">
            {details}
            <button type="submit" hidden disabled={submitting} />
          </Form>
        </StackItem>
      )}
      <StackItem>
        <Form
          {...formProps}
          key={separateDetails ? String(hubLogin) : "desktop"}
          aria-label={hubLogin ? "SoftEther Virtual Hub login" : "SoftEther server login"}
        >
          {!separateDetails && details}
          {credentials}
        </Form>
      </StackItem>
    </Stack>
  );
};

export { ManagedLoginForm };
