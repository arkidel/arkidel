// Account page — the signed-in user's own profile. Renders inside the app
// shell (route in App.jsx). Talks to the auth context, never to Supabase
// directly. Only full_name is editable today; email is the read-only auth
// identity. The layout is structured so firm / title can join later, but only
// full_name is wired now.

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import usePageTitle from "../usePageTitle.js";
import { useAuth } from "../auth/AuthProvider.jsx";

const EMBER = "#C76E3A";

function formatMemberSince(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function Account() {
  usePageTitle("Account");
  const { user, profile, loading, updateProfile } = useAuth();

  const [fullName, setFullName] = useState("");
  // "idle" | "saving" | "saved" | "error"
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Seed the input from the profile once it has loaded (it arrives async,
  // after the first render). Resyncs if the underlying profile changes.
  const savedName = profile?.full_name ?? "";
  useEffect(() => {
    setFullName(savedName);
  }, [savedName]);

  // Auth still resolving → render nothing rather than flash a signed-out state.
  if (loading) return null;
  // Resolved and signed out → the page self-gates (no router-level guard).
  if (!user) return <Navigate to="/sign-in" replace />;

  const trimmed = fullName.trim();
  const unchanged = trimmed === savedName;
  const saving = status === "saving";

  async function handleSave() {
    setStatus("saving");
    setErrorMessage("");
    const { error } = await updateProfile({ full_name: trimmed });
    if (error) {
      setErrorMessage(error.message || "Could not save. Please try again.");
      setStatus("error");
      return;
    }
    setStatus("saved");
  }

  return (
    <section className="px-8 py-16 text-midnight">
      <div className="max-w-xl mx-auto">
        <h1 className="font-serif text-4xl mb-10">Account</h1>

        {/* Full name — the one editable field today. */}
        <div className="mb-10">
          <label htmlFor="account-full-name" className="block text-sm font-medium mb-2">
            Full name
          </label>
          <input
            id="account-full-name"
            name="full_name"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
              if (status !== "idle") setStatus("idle");
            }}
            placeholder="Your name"
            className="w-full rounded-lg border border-midnight/25 bg-white px-4 py-3 text-base text-midnight outline-none focus:border-midnight"
          />

          {status === "error" && (
            <p role="alert" className="mt-3 text-sm" style={{ color: EMBER }}>
              {errorMessage}
            </p>
          )}

          <div className="mt-5 flex items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || unchanged}
              className="rounded-lg bg-midnight px-5 py-2.5 text-base text-bone hover:bg-[#2C3E55] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {status === "saved" && (
              <span role="status" aria-live="polite" className="text-sm text-midnight/70">
                Saved
              </span>
            )}
          </div>
        </div>

        {/* Email — read-only auth identity. Deliberately user.email, not
            profile.email (the latter is only a signup-time snapshot). */}
        <div className="mb-10">
          <div className="block text-sm font-medium mb-2">Email</div>
          <div className="w-full rounded-lg border border-midnight/15 bg-midnight/[0.03] px-4 py-3 text-base text-midnight/80">
            {user.email}
          </div>
          <p className="mt-2 text-sm text-midnight/60">
            This is your sign-in email. It isn't changed here.
          </p>
        </div>

        {/* Member since — plain date from the auth account. */}
        <div>
          <div className="block text-sm font-medium mb-2">Member since</div>
          <div className="text-base text-midnight/80">
            {formatMemberSince(user.created_at)}
          </div>
        </div>
      </div>
    </section>
  );
}
