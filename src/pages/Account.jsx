// Account page — the signed-in user's own profile. Renders inside the app
// shell (route in App.jsx). Talks to the auth context, never to Supabase
// directly. full_name and nickname are editable behind one Save that sends a
// diffed patch (only the fields that changed); email is the read-only auth
// identity. The layout is structured so firm / title can join later.

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
  const [nickname, setNickname] = useState("");
  // "idle" | "saving" | "saved" | "error" — one shared status for the form.
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [savedAt, setSavedAt] = useState(null);

  // The loaded-profile baseline the diff is computed against. Held locally so
  // a successful save can advance it immediately (re-disabling the button)
  // without waiting on the context profile round-trip. Nickname's baseline is
  // null-normalized: the column stores null, never "".
  const loadedName = profile?.full_name ?? "";
  const loadedNickname = profile?.nickname ?? null;
  const [baselineName, setBaselineName] = useState(loadedName);
  const [baselineNickname, setBaselineNickname] = useState(loadedNickname);

  // Seed the inputs and baseline from the profile once it has loaded (it
  // arrives async, after the first render). Resyncs if the profile changes.
  useEffect(() => {
    setBaselineName(loadedName);
    setFullName(loadedName);
  }, [loadedName]);
  useEffect(() => {
    setBaselineNickname(loadedNickname);
    setNickname(loadedNickname ?? "");
  }, [loadedNickname]);

  // Auth still resolving → render nothing rather than flash a signed-out state.
  if (loading) return null;
  // Resolved and signed out → the page self-gates (no router-level guard).
  if (!user) return <Navigate to="/sign-in" replace />;

  // Diffed patch: only the fields that differ from the baseline. Nickname is
  // normalized before comparison — trimmed, "" coerced to null — so "" and
  // null compare as equal and clearing an already-empty field is no change.
  const trimmedName = fullName.trim();
  const normalizedNickname = nickname.trim() || null;
  const patch = {};
  if (trimmedName !== baselineName) patch.full_name = trimmedName;
  if (normalizedNickname !== baselineNickname) patch.nickname = normalizedNickname;
  const hasChanges = Object.keys(patch).length > 0;
  const saving = status === "saving";

  async function handleSave() {
    setStatus("saving");
    setErrorMessage("");
    const { error } = await updateProfile(patch);
    if (error) {
      // Form state untouched — the user's edits stay in the inputs.
      setErrorMessage(error.message || "Could not save. Please try again.");
      setStatus("error");
      return;
    }
    // Advance the baseline to what was just saved, so the button disables.
    if ("full_name" in patch) setBaselineName(patch.full_name);
    if ("nickname" in patch) setBaselineNickname(patch.nickname);
    setSavedAt(new Date());
    setStatus("saved");
  }

  return (
    <section className="px-8 py-16 text-midnight">
      <div className="max-w-xl mx-auto">
        <h1 className="font-serif text-4xl mb-10">Account</h1>

        {/* Full name. */}
        <div className="mb-6">
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
        </div>

        {/* Nickname — optional; empty clears it (stored as null). */}
        <div className="mb-6">
          <label htmlFor="account-nickname" className="block text-sm font-medium mb-2">
            Nickname
          </label>
          <input
            id="account-nickname"
            name="nickname"
            type="text"
            autoComplete="nickname"
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value);
              if (status !== "idle") setStatus("idle");
            }}
            placeholder="Optional"
            className="w-full rounded-lg border border-midnight/25 bg-white px-4 py-3 text-base text-midnight outline-none focus:border-midnight"
          />
          <p className="mt-2 text-sm text-midnight/60">
            Used to greet you on your home page.
          </p>
        </div>

        {/* One Save for the profile form: sends only the changed fields, and
            disables when nothing effectively changed. */}
        <div className="mb-10">
          {status === "error" && (
            <p role="alert" className="mb-3 text-sm" style={{ color: EMBER }}>
              {errorMessage}
            </p>
          )}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="rounded-lg bg-midnight px-5 py-2.5 text-base text-bone hover:bg-[#2C3E55] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {status === "saved" && savedAt && (
              <span role="status" aria-live="polite" className="text-sm text-midnight/70">
                Saved ·{" "}
                {savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
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
