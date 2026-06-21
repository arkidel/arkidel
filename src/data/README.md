# Data-access boundary

This directory is the **single place — besides `src/auth/`** — that imports the
Supabase client (`src/lib/supabase.js`) for data operations.

## The rule

Components and pages call **data-layer functions** exported from here:

```js
// in a component
import { getProcessingActivities } from "../data/processing-activities.js";
const activities = await getProcessingActivities();
```

Components **never** call `supabase.from(...)`, `supabase.rpc(...)`, or import
`src/lib/supabase.js` directly. All table/RPC access is wrapped by a named
function in this directory.

## Why

This boundary is what keeps a future move to a server backend (an API, edge
functions, a different database) a refactor of **one layer** instead of the
whole app. If every component reached into `supabase.from(...)`, that move would
touch every component. Funnelling data access through named functions here means
the call sites stay stable and only the implementations behind them change.

The boundary is enforced mechanically, not just by convention: an ESLint
`no-restricted-imports` rule (see `eslint.config.js`) forbids importing
`src/lib/supabase.js` from anywhere except `src/data/**` and `src/auth/**`.

## Status

`organizations.js` is the first domain module (`getMyOrganizations`,
`createOrganization`) — org onboarding for the authenticated area. More arrive
with the Map module's schema.
