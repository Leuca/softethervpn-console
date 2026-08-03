import * as React from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_THEME_STORAGE_KEY, ThemeProvider } from "@app/ThemeContext";
import { AppLayout } from "./AppLayout";

vi.mock("@app/ServerContext", () => ({
  useServer: () => ({
    user: "Administrator",
    hideAdminOnly: false,
    hideNonCluster: false,
    hideNonBridge: false,
    hiddenLabels: new Set<string>(),
  }),
}));

vi.mock("@app/managed/ManagedSessionGate", () => ({
  useManagedSession: () => null,
}));

vi.mock("@app/routes", () => ({
  routes: [
    { label: "Dashboard", path: "/" },
    { label: "Next page", path: "/next" },
  ],
  isRouteAccessible: () => true,
}));

const RouteControl = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/next")}>
      Open next page
    </button>
  );
};

const renderLayout = () =>
  render(
    <ThemeProvider>
      <MemoryRouter>
        <AppLayout>
          <RouteControl />
        </AppLayout>
      </MemoryRouter>
    </ThemeProvider>,
  );

describe("AppLayout", () => {
  afterEach(() => {
    window.localStorage.removeItem(APP_THEME_STORAGE_KEY);
  });

  it("moves focus to a focusable main landmark after route changes", async () => {
    const user = userEvent.setup();
    renderLayout();

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("tabindex", "-1");

    await user.click(screen.getByRole("button", { name: "Open next page" }));
    await waitFor(() => expect(main).toHaveFocus());
  });

  it("applies and remembers the selected color theme", async () => {
    const user = userEvent.setup();
    const firstRender = renderLayout();

    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));

    expect(document.documentElement).toHaveClass("pf-v6-theme-dark");
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("dark");

    firstRender.unmount();
    renderLayout();

    expect(document.documentElement).toHaveClass("pf-v6-theme-dark");
    await user.click(screen.getByRole("button", { name: "Switch to light mode" }));

    expect(document.documentElement).not.toHaveClass("pf-v6-theme-dark");
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("light");
  });

  it("uses the system color preference when no theme is saved", () => {
    vi.mocked(window.matchMedia).mockReturnValueOnce({ matches: true } as MediaQueryList);

    renderLayout();

    expect(document.documentElement).toHaveClass("pf-v6-theme-dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });
});
