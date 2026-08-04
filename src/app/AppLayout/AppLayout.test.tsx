import * as React from "react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_CONTRAST_STORAGE_KEY, APP_THEME_STORAGE_KEY, ThemeProvider } from "@app/ThemeContext";
import { AppLayout } from "./AppLayout";

const defaultMatchMedia = window.matchMedia;

interface MockMediaQuery {
  mediaQueryList: MediaQueryList & { matches: boolean };
  listeners: Set<EventListener>;
}

const installMatchMedia = (initialMatches: Record<string, boolean>) => {
  const queries = new Map<string, MockMediaQuery>();

  window.matchMedia = vi.fn((query: string) => {
    const existing = queries.get(query);
    if (existing) {
      return existing.mediaQueryList;
    }

    const listeners = new Set<EventListener>();
    const mediaQueryList = {
      matches: initialMatches[query] ?? false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_type: string, listener: EventListener) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: EventListener) => {
        listeners.delete(listener);
      }),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList & { matches: boolean };
    queries.set(query, { mediaQueryList, listeners });
    return mediaQueryList;
  });

  return (query: string, matches: boolean) => {
    const mockQuery = queries.get(query);
    if (!mockQuery) {
      throw new Error(`Media query was not registered: ${query}`);
    }
    mockQuery.mediaQueryList.matches = matches;
    const event = new Event("change");
    mockQuery.listeners.forEach((listener) => listener(event));
  };
};

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
    window.localStorage.removeItem(APP_CONTRAST_STORAGE_KEY);
    window.matchMedia = defaultMatchMedia;
  });

  it("moves focus to a focusable main landmark after route changes", async () => {
    const user = userEvent.setup();
    renderLayout();

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("tabindex", "-1");

    await user.click(screen.getByRole("button", { name: "Open next page" }));
    await waitFor(() => expect(main).toHaveFocus());
  });

  it("applies and remembers explicit appearance preferences", async () => {
    installMatchMedia({
      "(prefers-color-scheme: dark)": true,
      "(forced-colors: active)": true,
    });
    const user = userEvent.setup();
    const firstRender = renderLayout();

    expect(document.documentElement).toHaveClass("pf-v6-theme-dark");
    expect(document.documentElement).toHaveClass("pf-v6-theme-high-contrast");

    await user.click(
      screen.getByRole("button", {
        name: "Appearance, color scheme: System, contrast: System",
      }),
    );
    expect(screen.getByRole("listbox", { name: "Color scheme" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Contrast" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "System color scheme" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const lightColorScheme = screen.getByRole("option", {
      name: "Light color scheme",
    });
    expect(lightColorScheme).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("option", { name: "System contrast" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(lightColorScheme);

    expect(document.documentElement).not.toHaveClass("pf-v6-theme-dark");
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBe("light");

    await user.click(
      screen.getByRole("button", {
        name: "Appearance, color scheme: Light, contrast: System",
      }),
    );
    expect(screen.getByRole("option", { name: "Light color scheme" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const standardContrast = screen.getByRole("option", {
      name: "Standard contrast",
    });
    expect(standardContrast).toHaveAttribute("aria-selected", "false");
    await user.click(standardContrast);

    expect(document.documentElement).not.toHaveClass("pf-v6-theme-high-contrast");
    expect(window.localStorage.getItem(APP_CONTRAST_STORAGE_KEY)).toBe("default");

    firstRender.unmount();
    renderLayout();

    expect(document.documentElement).not.toHaveClass("pf-v6-theme-dark");
    expect(document.documentElement).not.toHaveClass("pf-v6-theme-high-contrast");
  });

  it("follows live system appearance preferences by default", () => {
    const setMatches = installMatchMedia({
      "(prefers-color-scheme: dark)": true,
      "(prefers-contrast: more)": false,
      "(forced-colors: active)": true,
    });

    renderLayout();

    expect(document.documentElement).toHaveClass("pf-v6-theme-dark");
    expect(document.documentElement).toHaveClass("pf-v6-theme-high-contrast");
    expect(window.localStorage.getItem(APP_THEME_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(APP_CONTRAST_STORAGE_KEY)).toBeNull();

    act(() => {
      setMatches("(prefers-color-scheme: dark)", false);
      setMatches("(forced-colors: active)", false);
    });

    expect(document.documentElement).not.toHaveClass("pf-v6-theme-dark");
    expect(document.documentElement).not.toHaveClass("pf-v6-theme-high-contrast");
  });
});
