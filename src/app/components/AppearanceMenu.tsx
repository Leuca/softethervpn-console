import * as React from "react";
import {
  Dropdown,
  DropdownGroup,
  DropdownItem,
  DropdownList,
  Icon,
  MenuToggle,
} from "@patternfly/react-core";
import { RhUiDarkModeIcon, RhUiLightModeIcon } from "@patternfly/react-icons";
import { ColorSchemePreference, ContrastPreference, useTheme } from "@app/ThemeContext";

interface AppearanceMenuProps {
  className?: string;
}

const colorSchemes: ReadonlyArray<{
  value: ColorSchemePreference;
  label: string;
  description?: string;
}> = [
  { value: "system", label: "System", description: "Use the device preference" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const contrasts: ReadonlyArray<{
  value: ContrastPreference;
  label: string;
  ariaLabel: string;
  description?: string;
}> = [
  {
    value: "system",
    label: "System",
    ariaLabel: "System contrast",
    description: "Use the device preference",
  },
  { value: "default", label: "Standard", ariaLabel: "Standard contrast" },
  { value: "high", label: "High contrast", ariaLabel: "High contrast" },
];

const SystemThemeIcon = () => (
  <svg className="pf-v6-svg" fill="currentColor" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M23.94 16a1 1 0 0 1-.992-.876 6.957 6.957 0 0 0-6.069-6.062 1 1 0 1 1 .242-1.985 8.953 8.953 0 0 1 7.812 7.8A.999.999 0 0 1 23.94 16ZM16 5a1 1 0 0 1-1-1V1a1 1 0 1 1 2 0v3a1 1 0 0 1-1 1Zm0 27a1 1 0 0 1-1-1v-3a1 1 0 1 1 2 0v3a1 1 0 0 1-1 1ZM4 17H1a1 1 0 1 1 0-2h3a1 1 0 1 1 0 2Zm27 0h-3a1 1 0 1 1 0-2h3a1 1 0 1 1 0 2ZM5.394 27.606a1 1 0 0 1-.707-1.707l2.12-2.12a1 1 0 1 1 1.415 1.413L6.1 27.313a.997.997 0 0 1-.707.293ZM24.485 8.515a1 1 0 0 1-.707-1.707L25.9 4.686a1 1 0 1 1 1.415 1.415l-2.122 2.12a.997.997 0 0 1-.707.294Zm-16.97 0a.997.997 0 0 1-.707-.293L4.686 6.1a1 1 0 1 1 1.415-1.415l2.12 2.122a1 1 0 0 1-.706 1.707Zm19.091 19.091a.997.997 0 0 1-.707-.293l-2.12-2.12a1 1 0 1 1 1.413-1.415l2.122 2.121a1 1 0 0 1-.707 1.707ZM16 24.875c-4.894 0-8.875-3.981-8.875-8.875a8.879 8.879 0 0 1 5.227-8.088.876.876 0 0 1 1.153 1.163 6.945 6.945 0 0 0-.63 2.925A7.133 7.133 0 0 0 20 19.125a6.948 6.948 0 0 0 2.925-.63.876.876 0 0 1 1.163 1.154A8.88 8.88 0 0 1 16 24.875Zm-4.785-14.153A7.135 7.135 0 0 0 8.875 16 7.133 7.133 0 0 0 16 23.125a7.13 7.13 0 0 0 5.278-2.34c-.419.06-.845.09-1.278.09-4.894 0-8.875-3.981-8.875-8.875 0-.433.03-.86.09-1.278Z" />
  </svg>
);

const AppearanceMenu: React.FunctionComponent<AppearanceMenuProps> = ({ className }) => {
  const { colorScheme, contrast, setColorScheme, setContrast } = useTheme();
  const [isOpen, setIsOpen] = React.useState(false);
  const colorSchemeLabel = colorSchemes.find(({ value }) => value === colorScheme)?.label;
  const contrastLabel = contrasts.find(({ value }) => value === contrast)?.label;
  const ColorSchemeIcon = {
    system: SystemThemeIcon,
    light: RhUiLightModeIcon,
    dark: RhUiDarkModeIcon,
  }[colorScheme];

  return (
    <Dropdown
      role="listbox"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onSelect={() => setIsOpen(false)}
      popperProps={{ position: "right" }}
      shouldFocusToggleOnSelect
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          className={className}
          aria-label={`Appearance, color scheme: ${colorSchemeLabel}, contrast: ${contrastLabel}`}
          title={`Theme selection, current: ${colorSchemeLabel}`}
          icon={
            <Icon size="lg">
              <ColorSchemeIcon />
            </Icon>
          }
          isExpanded={isOpen}
          onClick={() => setIsOpen((open) => !open)}
        />
      )}
    >
      <DropdownGroup label="Color scheme" labelHeadingLevel="h3">
        <DropdownList aria-label="Color scheme">
          {colorSchemes.map(({ value, label, description }) => (
            <DropdownItem
              key={value}
              value={`color-${value}`}
              description={description}
              isSelected={colorScheme === value}
              aria-label={`${label} color scheme`}
              onClick={() => setColorScheme(value)}
            >
              {label}
            </DropdownItem>
          ))}
        </DropdownList>
      </DropdownGroup>
      <DropdownGroup label="Contrast" labelHeadingLevel="h3">
        <DropdownList aria-label="Contrast">
          {contrasts.map(({ value, label, ariaLabel, description }) => (
            <DropdownItem
              key={value}
              value={`contrast-${value}`}
              description={description}
              isSelected={contrast === value}
              aria-label={ariaLabel}
              onClick={() => setContrast(value)}
            >
              {label}
            </DropdownItem>
          ))}
        </DropdownList>
      </DropdownGroup>
    </Dropdown>
  );
};

export { AppearanceMenu };
