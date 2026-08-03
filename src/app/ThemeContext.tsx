import * as React from "react";

type AppTheme = "light" | "dark";

interface ThemeContextValue {
  theme: AppTheme;
  toggleTheme: () => void;
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const APP_THEME_STORAGE_KEY = "softether-vpn-console.theme";
const DARK_THEME_CLASS = "pf-v6-theme-dark";

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const getPreferredTheme = (): AppTheme =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";

const loadTheme = (): AppTheme => {
  try {
    const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
  } catch {
    // Browser storage can be unavailable without preventing theme selection.
  }

  return getPreferredTheme();
};

const saveTheme = (theme: AppTheme): void => {
  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  } catch {
    // Browser storage can be unavailable without preventing theme changes.
  }
};

const ThemeProvider: React.FunctionComponent<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = React.useState<AppTheme>(loadTheme);

  React.useLayoutEffect(() => {
    document.documentElement.classList.toggle(DARK_THEME_CLASS, theme === "dark");

    return () => document.documentElement.classList.remove(DARK_THEME_CLASS);
  }, [theme]);

  const toggleTheme = React.useCallback(() => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      saveTheme(nextTheme);
      return nextTheme;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};

const useTheme = (): ThemeContextValue => {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};

export { ThemeProvider, useTheme };
