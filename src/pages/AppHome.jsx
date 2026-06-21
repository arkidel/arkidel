// Authenticated placeholder (/app), gated by RequireAuth.
//
// This is a deliberate STUB. It exists only to prove the auth flow lands
// somewhere and to give a sign-out control. It is the future home of the
// authenticated app / Map area; org onboarding (a signed-in user has a profile
// but no organization yet) comes next and is out of scope here.

import { useState } from "react";
import usePageTitle from "../usePageTitle.js";
import { useAuth } from "../auth/AuthProvider.jsx";

export default function AppHome() {
  usePageTitle("App");
  const { user, signOut } = useAuth();
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
        <h1 className="font-serif text-4xl mb-4">You're signed in.</h1>
        <p className="text-base leading-relaxed text-midnight/80 mb-10">
          Signed in as{" "}
          <span className="font-medium text-midnight">
            {user?.email ?? "your account"}
          </span>
          . There's nothing here yet — this placeholder stands in for the
          authenticated workspace. Organization setup comes next.
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
