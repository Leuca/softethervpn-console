import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Mock, afterEach, describe, expect, it, vi } from "vitest";
import { MANAGED_LOGIN_HINTS_KEY, ManagedLoginForm } from "./ManagedLoginForm";
import { ManagedSessionApiError, login } from "./sessionApi";

vi.mock("./sessionApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./sessionApi")>()),
  login: vi.fn(),
}));

const loginMock = login as unknown as Mock;

describe("ManagedLoginForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("submits the selected server and reports the authenticated session", async () => {
    const session = { authenticated: true, host: "vpn.example.com", port: 443, hub: "" };
    loginMock.mockResolvedValue(session);
    const onLogin = vi.fn();
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={onLogin} />);

    await user.type(screen.getByLabelText("Server host"), "vpn.example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        host: "vpn.example.com",
        port: 443,
        hub: "",
        password: "secret",
        allowSelfSigned: false,
      }),
    );
    expect(onLogin).toHaveBeenCalledWith(session);
  });

  it("preserves and submits a password autofilled without a change event", async () => {
    const details = { host: "vpn.example.com", port: 5555, hub: "DEFAULT", allowSelfSigned: false };
    window.localStorage.setItem(MANAGED_LOGIN_HINTS_KEY, JSON.stringify(details));
    loginMock.mockResolvedValue({ authenticated: true, ...details });
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={vi.fn()} />);

    const password = screen.getByLabelText<HTMLInputElement>("Password");
    password.value = "autofilled-secret";
    await user.click(screen.getByRole("button", { name: "Advanced connection options" }));
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(loginMock).toHaveBeenCalledWith({ ...details, password: "autofilled-secret" });
    expect(JSON.parse(window.localStorage.getItem(MANAGED_LOGIN_HINTS_KEY) ?? "{}")).toEqual(
      details,
    );
  });

  it.each(["Server", "Virtual Hub"])("accepts a single desktop autofill for %s", async (scope) => {
    loginMock.mockResolvedValue({ authenticated: true });
    const user = userEvent.setup();
    render(<ManagedLoginForm onLogin={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: scope }));
    const password = screen.getByLabelText<HTMLInputElement>("Password");
    const form = password.closest("form")!;
    const fill = (id: string, value: string) => {
      const field = form.elements.namedItem(id);
      expect(field).toBeInstanceOf(HTMLInputElement);
      (field as HTMLInputElement).value = value;
    };
    fill("managed-login-host", "desktop.example");
    fill("managed-login-port", "5555");
    if (scope === "Virtual Hub") fill("managed-login-hub", "OPS");
    fill("managed-login-password", "vault-secret");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(loginMock).toHaveBeenCalledWith({
      host: "desktop.example",
      port: 5555,
      hub: scope === "Virtual Hub" ? "OPS" : "",
      password: "vault-secret",
      allowSelfSigned: false,
    });
  });

  it("keeps iPhone server details separate and offers the hub as a username only for Virtual Hub login", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS)");
    loginMock.mockResolvedValue({ authenticated: true });
    const user = userEvent.setup();
    render(<ManagedLoginForm onLogin={vi.fn()} />);

    const password = screen.getByLabelText<HTMLInputElement>("Password");
    const host = screen.getByLabelText<HTMLInputElement>("Server host");
    const port = screen.getByLabelText<HTMLInputElement>("Port");
    expect(screen.getByRole("button", { name: "Server" })).toHaveAttribute("aria-pressed", "true");
    expect(password.form).toBe(screen.getByRole("form", { name: "SoftEther server login" }));
    expect(host.form).toBe(screen.getByRole("form", { name: "SoftEther server details" }));
    expect(port.form).toBe(host.form);
    expect(screen.queryByRole("textbox", { name: "Virtual Hub" })).not.toBeInTheDocument();

    await user.type(host, "vpn.example.com");
    password.value = "server-secret";
    await user.click(screen.getByRole("button", { name: "Virtual Hub" }));
    const hub = screen.getByRole<HTMLInputElement>("textbox", { name: "Virtual Hub" });
    const hubPassword = screen.getByLabelText<HTMLInputElement>("Password");
    expect(hub).toHaveAttribute("autocomplete", "username");
    expect(hub).toHaveAttribute("required");
    expect(hub.form).toBe(screen.getByRole("form", { name: "SoftEther Virtual Hub login" }));
    expect(hubPassword.form).toBe(hub.form);
    expect(hubPassword).toHaveValue("");

    hubPassword.value = "hub-secret";
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(hub).toHaveFocus();
    expect(hub).toHaveAccessibleDescription(/Enter the Virtual Hub name\./);
    expect(loginMock).not.toHaveBeenCalled();

    hub.value = "DEFAULT";
    await user.keyboard("{Enter}");

    expect(loginMock).toHaveBeenCalledWith({
      host: "vpn.example.com",
      port: 443,
      hub: "DEFAULT",
      password: "hub-secret",
      allowSelfSigned: false,
    });
  });

  it.each(["STAGING", ""])(
    "keeps the edited hub %j but not passwords across scopes",
    async (name) => {
      const details = { host: "vpn.example.com", port: 443, hub: "PROD", allowSelfSigned: false };
      window.localStorage.setItem(MANAGED_LOGIN_HINTS_KEY, JSON.stringify(details));
      const user = userEvent.setup();
      render(<ManagedLoginForm onLogin={vi.fn()} />);

      const hub = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Virtual Hub" });
      const password = () => screen.getByLabelText<HTMLInputElement>("Password");
      expect(hub()).toHaveValue("PROD");
      hub().value = name;
      password().value = "hub-secret";
      await user.click(screen.getByRole("button", { name: "Server" }));
      expect(password()).toHaveValue("");

      password().value = "server-secret";
      await user.click(screen.getByRole("button", { name: "Virtual Hub" }));
      expect(hub()).toHaveValue(name);
      expect(password()).toHaveValue("");
      expect(window.localStorage.getItem(MANAGED_LOGIN_HINTS_KEY)).toBe(JSON.stringify(details));
    },
  );

  it("keeps one stable login action while authenticating", async () => {
    loginMock.mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={vi.fn()} />);

    await user.type(screen.getByLabelText("Server host"), "vpn.example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    const submit = screen.getByRole("button", { name: "Log in" });
    await user.click(submit);

    expect(submit).toBeDisabled();
    expect(screen.getByRole("button", { name: "Virtual Hub" })).toBeDisabled();
    expect(submit.closest("form")).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Logging in");
  });

  it("submits hub and self-signed certificate settings", async () => {
    const session = { authenticated: true, host: "vpn.example.com", port: 5555, hub: "DEFAULT" };
    loginMock.mockResolvedValue(session);
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={vi.fn()} />);

    await user.type(screen.getByLabelText("Server host"), "vpn.example.com");
    await user.clear(screen.getByLabelText("Port"));
    await user.type(screen.getByLabelText("Port"), "5555");
    await user.click(screen.getByRole("button", { name: "Virtual Hub" }));
    await user.type(screen.getByRole("textbox", { name: "Virtual Hub" }), "DEFAULT");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Advanced connection options" }));
    await user.click(screen.getByLabelText("Allow a self-signed SoftEther server certificate"));
    expect(screen.getByRole("button", { name: "Advanced connection options" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        host: "vpn.example.com",
        port: 5555,
        hub: "DEFAULT",
        password: "secret",
        allowSelfSigned: true,
      }),
    );
  });

  it("shows accessible field validation before contacting the gateway", async () => {
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={vi.fn()} />);

    await user.clear(screen.getByLabelText("Port"));
    await user.click(screen.getByRole("button", { name: "Log in" }));

    const host = screen.getByLabelText("Server host");
    expect(host).toHaveFocus();
    expect(host).toHaveAccessibleDescription(
      /Enter the SoftEther server host name or IP address\./,
    );
    expect(screen.getByLabelText("Port")).toHaveAccessibleDescription(
      /Enter a TCP port between 1 and 65535\./,
    );
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription(
      /Enter the administrator password\./,
    );

    expect(screen.getByLabelText("Server host")).toHaveAttribute("autocomplete", "url");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("form", { name: "SoftEther server login" })).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      new ManagedSessionApiError("The server did not accept these login details.", 401),
      "Login details rejected",
      "Check the server administrator password, then try again.",
    ],
    [
      new ManagedSessionApiError("The server certificate could not be verified.", 502),
      "Certificate verification failed",
      "Check the server address and certificate. For a trusted private server, allow self-signed certificates under Advanced connection options.",
    ],
    [
      new ManagedSessionApiError("The selected server could not be reached.", 502),
      "Server unavailable",
      "Check the server address and port, confirm that the server is running, then try again.",
    ],
  ])("presents a specific login failure", async (failure, title, message) => {
    loginMock.mockRejectedValue(failure);
    const user = userEvent.setup();

    render(<ManagedLoginForm onLogin={vi.fn()} />);

    await user.type(screen.getByLabelText("Server host"), "vpn.example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    const liveRegion = (await screen.findByText(message)).closest('[aria-live="polite"]');
    expect(liveRegion).toHaveTextContent(title);
    expect(document.getElementById("managed-login-error")).toHaveFocus();
    expect(screen.getByLabelText("Server host")).toHaveValue("vpn.example.com");
  });

  it("remembers and prefills only non-secret server details", async () => {
    const session = { authenticated: true, host: "vpn.example.com", port: 5555, hub: "DEFAULT" };
    loginMock.mockResolvedValue(session);
    const user = userEvent.setup();
    const rendered = render(<ManagedLoginForm onLogin={vi.fn()} />);

    await user.type(screen.getByLabelText("Server host"), "vpn.example.com");
    await user.clear(screen.getByLabelText("Port"));
    await user.type(screen.getByLabelText("Port"), "5555");
    await user.click(screen.getByRole("button", { name: "Virtual Hub" }));
    await user.type(screen.getByRole("textbox", { name: "Virtual Hub" }), "DEFAULT");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Advanced connection options" }));
    await user.click(screen.getByLabelText("Allow a self-signed SoftEther server certificate"));
    await user.click(screen.getByLabelText("Remember server details on this browser"));
    await user.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() =>
      expect(window.localStorage.getItem(MANAGED_LOGIN_HINTS_KEY)).not.toBeNull(),
    );
    expect(JSON.parse(window.localStorage.getItem(MANAGED_LOGIN_HINTS_KEY) ?? "{}")).toEqual({
      host: "vpn.example.com",
      port: 5555,
      hub: "DEFAULT",
      allowSelfSigned: true,
    });

    rendered.unmount();
    render(<ManagedLoginForm onLogin={vi.fn()} />);

    expect(screen.getByLabelText("Server host")).toHaveValue("vpn.example.com");
    expect(screen.getByLabelText("Port")).toHaveValue(5555);
    expect(screen.getByRole("textbox", { name: "Virtual Hub" })).toHaveValue("DEFAULT");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByLabelText("Allow a self-signed SoftEther server certificate")).toBeChecked();
    expect(screen.getByLabelText("Remember server details on this browser")).toBeChecked();

    await user.click(screen.getByLabelText("Remember server details on this browser"));
    expect(window.localStorage.getItem(MANAGED_LOGIN_HINTS_KEY)).toBeNull();
  });
});
