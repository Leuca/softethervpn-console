import * as React from "react";
import { Button } from "@patternfly/react-core";
import { MoonIcon, SunIcon } from "@patternfly/react-icons";
import { useTheme } from "@app/ThemeContext";

interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle: React.FunctionComponent<ThemeToggleProps> = ({ className }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = `Switch to ${isDark ? "light" : "dark"} mode`;

  return (
    <Button
      className={className}
      variant="plain"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
};

export { ThemeToggle };
