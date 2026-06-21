// Sign-in / sign-up surface — passwordless magic link.
//
// This is the entire authentication surface: the same email-a-magic-link flow
// signs in an existing user and creates a new one (Supabase makes the user on
// first link). It is AUTH-ONLY by design — there is no newsletter opt-in, no
// "by signing in you agree to receive…", nothing that couples marketing consent
// to authentication. Any waitlist/newsletter signup is a separate surface.

import { useState } from "react";
import { Navigate } from "react-router-dom";
import usePageTitle from "../usePageTitle.js";
import { useAuth } from "../auth/AuthProvider.jsx";

export default function SignIn() {
  usePageTitle("Sign in");
  const { session, loading, signInWithMagicLink } = useAuth();

  const [email, setEmail] = useState("");
  // "idle" | "sending" | "sent" | "error"
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Already signed in → no reason to show the form.
  if (!loading && session) {
    return <Navigate to="/app" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus("sending");
    setErrorMessage("");
    try {
      const { error } = await signInWithMagicLink(trimmed);
      if (error) {
        setErrorMessage(error.message || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  return (
    <section className="px-8 py-24 text-midnight">
      <div className="max-w-md mx-auto">
        <h1 className="font-serif text-4xl mb-3">Sign in.</h1>
        <p className="text-base leading-relaxed text-midnight/80 mb-10">
          Enter your email and we'll send you a secure sign-in link. No password
          to remember. If you don't have an account yet, the link creates one.
        </p>

        {status === "sent" ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-midnight/15 bg-white p-6"
          >
            <h2 className="font-serif text-2xl mb-2">Check your email.</h2>
            <p className="text-base leading-relaxed text-midnight/80">
              We sent a sign-in link to{" "}
              <span className="font-medium text-midnight">{email.trim()}</span>.
              Open it on this device to finish signing in. The link expires
              shortly, so use it soon.
            </p>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="mt-5 text-sm text-midnight underline underline-offset-2 decoration-midnight/40 hover:decoration-midnight transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <label
              htmlFor="signin-email"
              className="block text-sm font-medium mb-2"
            >
              Email address
            </label>
            <input
              id="signin-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-lg border border-midnight/25 bg-white px-4 py-3 text-base text-midnight outline-none focus:border-midnight"
            />

            {status === "error" && (
              <p role="alert" className="mt-3 text-sm text-[#C76E3A]">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              className="mt-6 w-full rounded-lg bg-midnight px-4 py-3 text-base text-bone hover:bg-[#2C3E55] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === "sending" ? "Sending…" : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
