import * as React from "react";

type ColorScheme = "light" | "dark";
type ColorSchemePreference = "system" | ColorScheme;
type Contrast = "default" | "high";
type ContrastPreference = "system" | Contrast;

interface ThemeContextValue {
  colorScheme: ColorSchemePreference;
  contrast: ContrastPreference;
  setColorScheme: (colorScheme: ColorSchemePreference) => void;
  setContrast: (contrast: ContrastPreference) => void;
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const APP_THEME_STORAGE_KEY = "softether-vpn-console.theme";
export const APP_CONTRAST_STORAGE_KEY = "softether-vpn-console.contrast";
const DARK_THEME_CLASS = "pf-v6-theme-dark";
const HIGH_CONTRAST_THEME_CLASS = "pf-v6-theme-high-contrast";
const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const HIGH_CONTRAST_QUERY = "(prefers-contrast: more)";
const FORCED_COLORS_QUERY = "(forced-colors: active)";

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const loadColorScheme = (): ColorSchemePreference => {
  try {
    const storedColorScheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (
      storedColorScheme === "system" ||
      storedColorScheme === "light" ||
      storedColorScheme === "dark"
    ) {
      return storedColorScheme;
    }
  } catch {
    // Browser storage can be unavailable without preventing theme selection.
  }

  return "system";
};

const loadContrast = (): ContrastPreference => {
  try {
    const storedContrast = window.localStorage.getItem(APP_CONTRAST_STORAGE_KEY);
    if (storedContrast === "system" || storedContrast === "default" || storedContrast === "high") {
      return storedContrast;
    }
  } catch {
    // Browser storage can be unavailable without preventing theme changes.
  }

  return "system";
};

const savePreference = (key: string, preference: string): void => {
  try {
    window.localStorage.setItem(key, preference);
  } catch {
    // Browser storage can be unavailable without preventing theme changes.
  }
};

const useMediaQuery = (query: string): boolean => {
  const getMatches = React.useCallback(
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    [query],
  );
  const [matches, setMatches] = React.useState(getMatches);

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
};

const ThemeProvider: React.FunctionComponent<ThemeProviderProps> = ({ children }) => {
  const [colorScheme, setColorSchemeState] = React.useState<ColorSchemePreference>(loadColorScheme);
  const [contrast, setContrastState] = React.useState<ContrastPreference>(loadContrast);
  const prefersDark = useMediaQuery(DARK_SCHEME_QUERY);
  const prefersHighContrast = useMediaQuery(HIGH_CONTRAST_QUERY);
  const forcedColorsActive = useMediaQuery(FORCED_COLORS_QUERY);
  const resolvedColorScheme: ColorScheme =
    colorScheme === "system" ? (prefersDark ? "dark" : "light") : colorScheme;
  const resolvedContrast: Contrast =
    contrast === "system"
      ? prefersHighContrast || forcedColorsActive
        ? "high"
        : "default"
      : contrast;

  React.useLayoutEffect(() => {
    document.documentElement.classList.toggle(DARK_THEME_CLASS, resolvedColorScheme === "dark");
    document.documentElement.classList.toggle(
      HIGH_CONTRAST_THEME_CLASS,
      resolvedContrast === "high",
    );

    return () => {
      document.documentElement.classList.remove(DARK_THEME_CLASS);
      document.documentElement.classList.remove(HIGH_CONTRAST_THEME_CLASS);
    };
  }, [resolvedColorScheme, resolvedContrast]);

  const setColorScheme = React.useCallback((nextColorScheme: ColorSchemePreference) => {
    setColorSchemeState(nextColorScheme);
    savePreference(APP_THEME_STORAGE_KEY, nextColorScheme);
  }, []);

  const setContrast = React.useCallback((nextContrast: ContrastPreference) => {
    setContrastState(nextContrast);
    savePreference(APP_CONTRAST_STORAGE_KEY, nextContrast);
  }, []);

  return (
    <ThemeContext.Provider value={{ colorScheme, contrast, setColorScheme, setContrast }}>
      {children}
    </ThemeContext.Provider>
  );
};

const useTheme = (): ThemeContextValue => {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
};

export { ThemeProvider, useTheme, type ColorSchemePreference, type ContrastPreference };
