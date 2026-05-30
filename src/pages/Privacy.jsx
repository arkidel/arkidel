import usePageTitle from "../usePageTitle.js";

export default function Privacy() {
  usePageTitle("Privacy Policy");
  return (
    <div className="max-w-3xl mx-auto px-8 py-16">
      <h1 className="font-serif text-4xl mb-2">Privacy Policy</h1>
      <p className="text-sm text-midnight/50 mb-16">Placeholder — legal copy TBD</p>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">What data we collect</h2>
        <p>Breach fact inputs are processed client-side only — no account, no login, no server-side storage of breach data entered into the Breach Clock.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Analytics</h2>
        <p>If Plausible or Fathom is enabled (Phase 4), describe what is and isn't tracked. Both are cookieless and GDPR-compliant by default.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Third-party services</h2>
        <p>Hosting (Vercel), analytics provider (TBD), error monitoring (Sentry — Phase 4). Each with a link to their own privacy policy.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Your rights</h2>
        <p>CCPA and GDPR rights disclosure. How to submit a data request. Contact information.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Contact</h2>
        <p>Email address for privacy questions — TBD.</p>
      </section>
    </div>
  );
}
