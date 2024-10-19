import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// Use mjs because ts is not yet officially supported
// https://eslint.org/docs/latest/use/configure/configuration-files#typescript-configuration-files
export default [
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: ["dist"],
    }, {
        rules: {
            "@typescript-eslint/no-explicit-any": ["off"],
            "@typescript-eslint/no-namespace": ["off"],
            "@typescript-eslint/no-unused-vars": ["off"],
            "no-undef": ["off"],
        },
    }
];
