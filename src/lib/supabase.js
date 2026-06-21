// Single Supabase client for the whole app.
//
// This is the ONLY module that calls createClient. Everything else reaches
// Supabase through one of two boundaries:
//   - src/auth/**  for authentication (session, sign-in/out)
//   - src/data/**  for data access (domain query/mutation functions)
// Components must not import this module directly; the ESLint
// no-restricted-imports rule enforces that. See src/data/README.md.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Fail loudly at module load if the environment is misconfigured, rather than
// letting a half-built client surface a confusing error deep in a request.
if (!supabaseUrl) {
  throw new Error(
    "VITE_SUPABASE_URL is not set. Add it to your .env file (see .env.example)."
  );
}
if (!supabasePublishableKey) {
  throw new Error(
    "VITE_SUPABASE_PUBLISHABLE_KEY is not set. Add it to your .env file (see .env.example)."
  );
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // Browser auth defaults — kept on deliberately.
    persistSession: true, // remember the session across reloads
    autoRefreshToken: true, // refresh the access token before it expires
    detectSessionInUrl: true, // hydrate the session from a magic-link callback
  },
});
