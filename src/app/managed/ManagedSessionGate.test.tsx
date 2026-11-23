import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Mock, afterEach, describe, expect, it, vi } from "vitest";
import { ManagedSessionGate, useManagedSession } from "./ManagedSessionGate";
import { ManagedSession, getSession, login, logout } from "./sessionApi";
import { openConnection } from "./connection";
import { ConnectionSwitcher } from "./ConnectionSwitcher";
import { indexConnection, knownIds } from "./connectionDirectory";
import { ThemeProvider } from "@app/ThemeContext";

vi.mock("./connection", async (original) => ({
  ...(await original<typeof import("./connection")>()),
  openConnection: vi.fn(),
}));

vi.mock("./sessionApi", () => ({
  getSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const getSessionMock = getSession as unknown as Mock;
const loginMock = login as unknown as Mock;
const logoutMock = logout as unknown as Mock;

const ManagedApp = () => {
  const session = useManagedSession();

  return (
    <div>
      Managed app
      {session && <ConnectionSwitcher current={session.current} onExpired={session.expired} />}
      <button type="button" onClick={session?.logout}>
        Log out
      </button>
    </div>
  );
};

const renderGate = () =>
  render(
    <ThemeProvider>
      <ManagedSessionGate>
        <ManagedApp />
      </ManagedSessionGate>
    </ThemeProvider>,
  );

describe("ManagedSessionGate", () => {
  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows a first-load spinner while checking the session", () => {
    getSessionMock.mockReturnValue(new Promise(() => undefined));

    renderGate();

    expect(screen.getByLabelText("Loading managed session")).toBeInTheDocument();
  });

  it("renders children when a managed session already exists", async () => {
    getSessionMock.mockResolvedValue({
      authenticated: true,
      host: "vpn.example.com",
      port: 443,
      hub: "",
    });

    renderGate();

    expect(await screen.findByText("Managed app")).toBeInTheDocument();
  });

  it("renders the login form when no managed session exists", async () => {
    getSessionMock.mockResolvedValue({ authenticated: false } satisfies ManagedSession);

    renderGate();

    expect(await screen.findByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Appearance, color scheme: System, contrast: System",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Managed app")).not.toBeInTheDocument();
  });

  it("opens a fresh document bound to the login connection", async () => {
    getSessionMock.mockResolvedValue({ authenticated: false } satisfies ManagedSession);
    loginMock.mockResolvedValue({
      authenticated: true,
      connectionId: "a".repeat(43),
      host: "vpn.example.com",
      port: 443,
      hub: "",
    });
    const user = userEvent.setup();

    renderGate();

    await user.type(await screen.findByLabelText("Server host"), "vpn.example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(openConnection).toHaveBeenCalledWith("a".repeat(43));
    expect(knownIds()).toEqual(["a".repeat(43)]);
    expect(screen.queryByText("Managed app")).not.toBeInTheDocument();
  });

  it("returns to login for an expired current connection and keeps the other server selectable", async () => {
    const a = {
      authenticated: true,
      connectionId: "a".repeat(43),
      host: "alpha.test",
      port: 443,
      hub: "",
    };
    const b = { ...a, connectionId: "b".repeat(43), host: "beta.test" };
    indexConnection(b.connectionId, true);
    getSessionMock
      .mockResolvedValueOnce(a)
      .mockImplementation(async (id) => (id === b.connectionId ? b : { authenticated: false }));
    renderGate();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Switch connection: alpha/ }));
    expect(await screen.findByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByText("Managed app")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Open connections/ }));
    expect(await screen.findByRole("menuitem", { name: /beta.test/ })).toHaveAttribute(
      "href",
      expect.stringContaining("?connection=" + b.connectionId),
    );
    expect(knownIds()).toEqual([b.connectionId]);
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it("returns to the login form after logout", async () => {
    getSessionMock.mockResolvedValue({
      authenticated: true,
      host: "vpn.example.com",
      port: 443,
      hub: "",
    });
    logoutMock.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderGate();

    await user.click(await screen.findByRole("button", { name: "Log out" }));

    expect(logoutMock).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: "Log in" })).toBeInTheDocument();
    expect(screen.queryByText("Managed app")).not.toBeInTheDocument();
  });
});
