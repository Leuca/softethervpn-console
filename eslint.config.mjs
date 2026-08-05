import eslint from "@eslint/js";
import eslintReact from "@eslint-react/eslint-plugin";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const frontendFiles = ["src/**/*.{ts,tsx}"];
const frontendJsxFiles = ["src/**/*.tsx"];
const gatewayFiles = ["gateway/src/**/*.ts"];

export default defineConfig(
  {
    files: [...frontendFiles, ...gatewayFiles],
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: frontendFiles,
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/exhaustive-deps": "error",
      "react-hooks/rules-of-hooks": "error",
    },
  },
  {
    files: frontendJsxFiles,
    plugins: { "@eslint-react": eslintReact },
    settings: { "react-x": { polymorphicPropName: "component" } },
    rules: {
      "@eslint-react/dom-no-dangerously-set-innerhtml": "error",
      "@eslint-react/dom-no-unsafe-target-blank": "error",
      "@eslint-react/jsx-no-comment-textnodes": "error",
      "@eslint-react/no-missing-key": "error",
    },
  },
);
