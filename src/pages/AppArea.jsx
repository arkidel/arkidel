// Authenticated area: the org gate at /app.
//
// Rendered behind RequireAuth and inside the app-wide OrgProvider (the single
// instance mounted at the authed boundary in App.jsx — this component no
// longer mounts its own). It gates on the shared org state:
//   loading  -> a quiet spinner (don't flash onboarding before orgs resolve)
//   no org   -> onboarding
//   has org  -> the app

import { useOrg } from "../org/OrgProvider.jsx";
import Onboarding from "./Onboarding.jsx";
import AppHome from "./AppHome.jsx";

export default function AppArea() {
  const { activeOrg, loading } = useOrg();

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-[50vh] flex items-center justify-center bg-bone text-midnight/60 font-sans text-sm"
      >
        Loading…
      </div>
    );
  }

  if (!activeOrg) {
    return <Onboarding />;
  }

  return <AppHome />;
}
