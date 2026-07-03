// Current-organization context.
//
// Lightweight org state for the authenticated area. It loads the signed-in
// user's organizations through the data layer (never the Supabase client
// directly) and exposes the current one. Mounted INSIDE RequireAuth so it only
// runs for signed-in users.
//
// activeOrg is "the first org" for now — a single-org assumption that's fine
// until org switching exists. organizations is the full list so a switcher can
// be added later without changing this contract.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getMyOrganizations } from "../data/organizations.js";

const OrgContext = createContext(null);

export function OrgProvider({ children }) {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Reload the org list from the data layer. Public for future consumers;
  // onboarding deliberately does NOT use it after create (see adoptOrganization).
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const orgs = await getMyOrganizations();
      setOrganizations(orgs);
      return orgs;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Adopt a just-created org into state without a re-select. Onboarding uses
  // this instead of refresh(): under the auth-state flux of a fresh sign-in,
  // re-running getMyOrganizations() can return [] (RLS sees an unsettled
  // context) even though the insert succeeded, which would strand the user on
  // onboarding. The insert's returned row is authoritative — adopt it directly.
  const adoptOrganization = useCallback((org) => {
    setOrganizations((prev) => {
      if (prev.some((o) => o.id === org.id)) return prev;
      const next = [...prev, org];
      next.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      return next;
    });
  }, []);

  const value = {
    organizations,
    activeOrg: organizations[0] ?? null,
    loading,
    refresh,
    adoptOrganization,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const context = useContext(OrgContext);
  if (context === null) {
    throw new Error("useOrg must be used within an <OrgProvider>.");
  }
  return context;
}
