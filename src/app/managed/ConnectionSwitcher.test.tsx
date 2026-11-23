import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ConnectionSwitcher } from "./ConnectionSwitcher";
import { indexConnection, knownIds } from "./connectionDirectory";
import { getSession } from "./sessionApi";
import { PendingDraftsProvider, usePendingDraft } from "./pendingDrafts";

vi.mock("./sessionApi", () => ({ getSession: vi.fn() }));
const a = {
  authenticated: true as const,
  host: "vpn.example",
  port: 443,
  hub: "",
  connectionId: "a".repeat(43),
};
const b = { ...a, hub: "OPS", connectionId: "b".repeat(43) };
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("shows verified targets and changes documents, not the current RPC client", async () => {
  const expired = "e".repeat(43);
  const offline = "f".repeat(43);
  for (const id of [a.connectionId, b.connectionId, expired, offline]) indexConnection(id, true);
  vi.mocked(getSession).mockImplementation(async (id) => {
    if (id === offline) throw new Error("offline");
    return id === a.connectionId ? a : id === b.connectionId ? b : { authenticated: false };
  });
  const logout = vi.fn();
  render(
    <>
      <ConnectionSwitcher current={a} onLogout={logout} />
    </>,
  );
  const user = userEvent.setup();
  const toggle = screen.getByRole("button", {
    name: "Switch connection: vpn.example:443, Server admin",
  });
  await user.click(toggle);
  const target = await screen.findByRole("menuitem", { name: /vpn.example:443 Hub: OPS/ });
  expect(target).toHaveAttribute("href", expect.stringContaining("?connection=" + b.connectionId));
  expect(screen.getByText("Some connections could not be checked")).toBeInTheDocument();
  expect(knownIds()).not.toContain(expired);
  expect(knownIds()).toContain(offline);
  expect(screen.getByText("Connect another server").closest("a")?.search).toBe("");
  await user.click(screen.getByRole("menuitem", { name: "Disconnect this connection" }));
  expect(logout).toHaveBeenCalledOnce();
});

it("offers live connections from the login page after another tab logs in", async () => {
  const user = userEvent.setup();
  vi.mocked(getSession).mockResolvedValue(b);
  render(<ConnectionSwitcher />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  indexConnection(b.connectionId, true);
  fireEvent(
    window,
    new StorageEvent("storage", { key: Object.keys(localStorage)[0], newValue: "1" }),
  );
  await user.click(screen.getByRole("button", { name: /Open connections/ }));
  expect(await screen.findByRole("menuitem", { name: /Hub: OPS/ })).toHaveAttribute(
    "href",
    expect.stringContaining(b.connectionId),
  );
  expect(localStorage.getItem(Object.keys(localStorage)[0])).toBe("1");
});

it.each([/Hub: OPS/, /Connect another server/])(
  "guards same-tab clicks on %s once",
  async (name) => {
    indexConnection(b.connectionId, true);
    vi.mocked(getSession).mockImplementation(async (id) => (id === b.connectionId ? b : a));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    function Draft() {
      usePendingDraft(() => true);
      return null;
    }
    render(
      <PendingDraftsProvider>
        <Draft />
        <ConnectionSwitcher current={a} />
      </PendingDraftsProvider>,
    );
    const click = async (init?: MouseEventInit) => {
      await user.click(screen.getByRole("button", { name: /Switch connection/ }));
      const link = await screen.findByRole("menuitem", { name });
      let blocked = false;
      // Observe the real link's default action without asking jsdom to navigate.
      window.addEventListener(
        "click",
        (event) => {
          blocked = event.defaultPrevented;
          event.preventDefault();
        },
        { once: true },
      );
      fireEvent.click(link, init);
      return blocked;
    };
    const unload = () => window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
    expect(await click({ ctrlKey: true })).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(unload()).toBe(false);
    expect(await click()).toBe(true);
    expect(unload()).toBe(false);
    confirm.mockReturnValue(true);
    expect(await click()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(unload()).toBe(true);
    expect(unload()).toBe(false);
  },
);

it.each(["offline", "malformed"])(
  "keeps the unindexed current connection when verification is %s",
  async (failure) => {
    const expired = vi.fn();
    if (failure === "offline")
      vi.mocked(getSession).mockRejectedValue(new Error("network unavailable"));
    else vi.mocked(getSession).mockResolvedValue(JSON.parse("{}"));
    render(<ConnectionSwitcher current={a} onExpired={expired} />);
    await userEvent.click(screen.getByRole("button", { name: /Switch connection/ }));
    expect(await screen.findByText("Some connections could not be checked")).toBeInTheDocument();
    expect(getSession).toHaveBeenCalledWith(a.connectionId);
    expect(expired).not.toHaveBeenCalled();
  },
);
