// Flat ESLint config (ESLint 9+/10).
//
// The one rule we care about here is the data-access boundary: the Supabase
// client (src/lib/supabase.js) may only be imported from the auth and data
// layers. Everywhere else must go through a data-layer function. See
// src/data/README.md for the rationale.
//
// Implementation note: import/no-restricted-paths (eslint-plugin-import) is the
// "natural" zone rule, but it needs an extra plugin and its `except` paths are
// resolved relative to the restricted file, which is awkward for "block
// everywhere EXCEPT these two directories". no-restricted-imports with a
// file-scoped override expresses the same intent with no extra dependency, so
// that is used here.

export default [
  {
    ignores: ["dist/**", "node_modules/**", "outputs/**"],
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/supabase", "**/lib/supabase.js"],
              message:
                "The Supabase client may only be imported from src/data/** or src/auth/**. Components must call data-layer functions instead (see src/data/README.md).",
            },
          ],
        },
      ],
    },
  },
  {
    // The two boundary layers — and the client module itself — are allowed to
    // import the Supabase client.
    files: ["src/data/**", "src/auth/**", "src/lib/supabase.js"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];
