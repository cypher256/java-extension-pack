import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: ["dist"],
    }, {
    rules: {
        "@typescript-eslint/no-namespace": ["off"],
        // TODO
        "@typescript-eslint/no-explicit-any": ["off"],
        "@typescript-eslint/no-require-imports": ["off"],
        "@typescript-eslint/no-this-alias": ["off"],
        "@typescript-eslint/no-unused-expressions": ["off"],
        "@typescript-eslint/no-unused-vars": ["off"],
        "no-cond-assign": ["off"],
        "no-constant-binary-expression": ["off"],
        "no-constant-condition": ["off"],
        "no-control-regex": ["off"],
        "no-empty": ["off"],
        "no-fallthrough": ["off"],
        "no-func-assign": ["off"],
        "no-misleading-character-class": ["off"],
        "no-prototype-builtins": ["off"],
        "no-redeclare": ["off"],
        "no-self-assign": ["off"],
        "no-sparse-arrays": ["off"],
        "no-undef": ["off"],
        "no-useless-escape": ["off"],
        "require-yield": ["off"],
    },
}];
