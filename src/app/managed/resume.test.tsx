import * as React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "@patternfly/react-core";
import { createMemoryRouter, Link, Outlet, RouterProvider } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { connectionUrl, rememberPosition } from "./connection";
import { forgetUnindexedPositions, indexConnection } from "./connectionDirectory";
import { PendingDraftsProvider, useDraftState, useEditorDismiss } from "./pendingDrafts";
import { RouteDraftGuard } from "./RouteDraftGuard";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

it("resumes each connection at its own page and hub tab; removing A does not reset B", () => {
  const a = "a".repeat(43),
    b = "b".repeat(43);
  rememberPosition(a, "/hubs/SALES", "?tab=users&unrelated=value");
  rememberPosition(b, "/settings/about", "");
  expect(new URL(connectionUrl(a)).hash).toBe("#/hubs/SALES?tab=users");
  expect(new URL(connectionUrl(b)).hash).toBe("#/settings/about");
  expect(new URL(connectionUrl(null)).hash).toBe("");
  indexConnection(a, false);
  expect(new URL(connectionUrl(a)).hash).toBe("");
  expect(new URL(connectionUrl(b)).hash).toBe("#/settings/about");
});

it("keeps saved locations when the shared directory cannot be read", () => {
  const id = "a".repeat(43);
  rememberPosition(id, "/settings/about", "");
  vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
    throw new DOMException("Storage is unavailable", "SecurityError");
  });
  forgetUnindexedPositions();
  expect(new URL(connectionUrl(id)).hash).toBe("#/settings/about");
});

it("blocks links and browser Back without losing the draft; explicit discard continues", async () => {
  function Editor() {
    const [value, edit] = useDraftState("");
    return (
      <>
        <input aria-label="Draft" value={value} onChange={(e) => edit(e.target.value)} />
        <Link to="/other">Other page</Link>
      </>
    );
  }
  const router = createMemoryRouter(
    [
      {
        element: (
          <PendingDraftsProvider>
            <RouteDraftGuard />
            <Outlet />
          </PendingDraftsProvider>
        ),
        children: [
          { path: "/edit", element: <Editor /> },
          { path: "/other", element: <p>Other content</p> },
        ],
      },
    ],
    { initialEntries: ["/other", "/edit"] },
  );
  const user = userEvent.setup();
  render(<RouterProvider router={router} />);
  await user.type(screen.getByLabelText("Draft"), "unfinished");
  await user.click(screen.getByText("Other page"));
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByLabelText("Draft")).toHaveValue("unfinished");
  await act(() => router.navigate(-1));
  await user.click(await screen.findByRole("button", { name: "Discard changes" }));
  expect(await screen.findByText("Other content")).toBeInTheDocument();
  router.dispose();
});

it("asks before dismissing an edited modal, not a reverted one", async () => {
  const close = vi.fn(),
    confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  function Editor() {
    const [value, edit] = React.useState("");
    const dismiss = useEditorDismiss(true, value, close);
    return (
      <>
        <input aria-label="Name" value={value} onChange={(e) => edit(e.target.value)} />
        <button onClick={dismiss}>Cancel</button>
      </>
    );
  }
  render(
    <PendingDraftsProvider>
      <Editor />
    </PendingDraftsProvider>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), "edit");
  await user.click(screen.getByText("Cancel"));
  expect(confirm).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
  await user.clear(screen.getByLabelText("Name"));
  await user.click(screen.getByText("Cancel"));
  expect(close).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledOnce();
});

it("keeps the editor and route when the native Back confirmation is dismissed", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const close = vi.fn();
  function Editor() {
    const [value, edit] = React.useState("");
    const dismiss = useEditorDismiss(true, value, close);
    return (
      <Modal isOpen aria-label="Listener" onClose={dismiss}>
        <input aria-label="Port" value={value} onChange={(e) => edit(e.target.value)} />
      </Modal>
    );
  }
  const router = createMemoryRouter(
    [
      {
        element: (
          <PendingDraftsProvider>
            <RouteDraftGuard />
            <Outlet />
          </PendingDraftsProvider>
        ),
        children: [
          { path: "/edit", element: <Editor /> },
          { path: "/", element: <p>Dashboard</p> },
        ],
      },
    ],
    { initialEntries: ["/", "/edit"] },
  );
  render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  );
  await userEvent.type(screen.getByLabelText("Port"), "443");
  await act(() => router.navigate(-1));
  expect(confirm).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
  expect(router.state.location.pathname).toBe("/edit");
  expect(screen.getAllByRole("dialog", { hidden: true })).toHaveLength(1);
  expect(screen.getByLabelText("Port")).toHaveValue("443");
  confirm.mockReturnValue(true);
  await act(() => router.navigate(-1));
  expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  router.dispose();
});
