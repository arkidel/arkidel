// Authenticated area: org context + gate.
//
// Rendered behind RequireAuth (so the user is signed in), this wraps the area
// in OrgProvider and gates on the org state:
//   loading  -> a quiet spinner (don't flash onboarding before orgs resolve)
//   no org   -> onboarding
//   has org  -> the app
//
// Keeping the provider here means it only mounts for signed-in users, and the
// gate has a single place to live.

import { OrgProvider, useOrg } from "../org/OrgProvider.jsx";
import Onboarding from "./Onboarding.jsx";
import AppHome from "./AppHome.jsx";

function AppGate() {
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

export default function AppArea() {
  return (
    <OrgProvider>
      <AppGate />
    </OrgProvider>
  );
}
