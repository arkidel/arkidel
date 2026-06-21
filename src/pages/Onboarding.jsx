// Organization onboarding.
//
// Shown by the authenticated-area gate when the signed-in user belongs to no
// organization yet. Creating one (via the data layer) and refreshing the org
// context flips the gate to the app — there's no manual redirect here; the gate
// re-renders once activeOrg is set.

import { useState } from "react";
import usePageTitle from "../usePageTitle.js";
import { useOrg } from "../org/OrgProvider.jsx";
import { createOrganization } from "../data/organizations.js";

export default function Onboarding() {
  usePageTitle("Create your organization");
  const { refresh } = useOrg();

  const [name, setName] = useState("");
  // "idle" | "saving" | "error"
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setStatus("saving");
    setErrorMessage("");
    try {
      await createOrganization(trimmed);
      // Pulls the new org; the gate then shows the app. This component unmounts,
      // so there's no need to reset status.
      await refresh();
    } catch (error) {
      setErrorMessage(
        error?.message ||
          "Couldn't create your organization. Please try again."
      );
      setStatus("error");
    }
  }

  return (
    <section className="px-8 py-24 text-midnight">
      <div className="max-w-md mx-auto">
        <p className="font-mono text-xs uppercase tracking-[0.15em] text-midnight/50 mb-3">
          One more step
        </p>
        <h1 className="font-serif text-4xl mb-3">Create your organization.</h1>
        <p className="text-base leading-relaxed text-midnight/80 mb-10">
          Your work in Arkidel lives inside an organization. Name yours to get
          started — you can invite colleagues to it later.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label
            htmlFor="org-name"
            className="block text-sm font-medium mb-2"
          >
            Organization name
          </label>
          <input
            id="org-name"
            name="name"
            type="text"
            autoComplete="organization"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme, Inc."
            className="w-full rounded-lg border border-midnight/25 bg-white px-4 py-3 text-base text-midnight outline-none focus:border-midnight"
          />

          {status === "error" && (
            <p role="alert" className="mt-3 text-sm text-[#C76E3A]">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={status === "saving"}
            className="mt-6 w-full rounded-lg bg-midnight px-4 py-3 text-base text-bone hover:bg-[#2C3E55] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {status === "saving" ? "Creating…" : "Create organization"}
          </button>
        </form>
      </div>
    </section>
  );
}
