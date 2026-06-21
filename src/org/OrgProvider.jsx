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

  // Reload the org list. Also used as the public refresh() so onboarding can
  // pull the just-created org and flip the gate to the app.
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

  const value = {
    organizations,
    activeOrg: organizations[0] ?? null,
    loading,
    refresh,
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
