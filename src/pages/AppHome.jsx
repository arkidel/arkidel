// Authenticated placeholder (/app), shown by the AppArea gate once the user is
// signed in AND belongs to an organization.
//
// This is a deliberate STUB. It exists only to prove the auth + org flow lands
// somewhere and to give a sign-out control. It is the future home of the
// authenticated app / Map area.

import { useState } from "react";
import usePageTitle from "../usePageTitle.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { useOrg } from "../org/OrgProvider.jsx";

export default function AppHome() {
  usePageTitle("App");
  const { user, signOut } = useAuth();
  const { activeOrg } = useOrg();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <section className="px-8 py-24 text-midnight">
      <div className="max-w-2xl mx-auto">
        <p className="font-mono text-xs uppercase tracking-[0.15em] text-midnight/50 mb-3">
          Stub — future authenticated app / Map area
        </p>
        <h1 className="font-serif text-4xl mb-4">
          {activeOrg?.name ?? "Your organization"}
        </h1>
        <p className="text-base leading-relaxed text-midnight/80 mb-10">
          Signed in as{" "}
          <span className="font-medium text-midnight">
            {user?.email ?? "your account"}
          </span>
          {activeOrg ? (
            <>
              {" "}in{" "}
              <span className="font-medium text-midnight">
                {activeOrg.name}
              </span>
            </>
          ) : null}
          . There's nothing here yet — this placeholder stands in for the
          authenticated workspace.
        </p>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="rounded-lg border border-midnight/25 bg-white px-5 py-3 text-base text-midnight hover:bg-midnight hover:text-bone transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </section>
  );
}
