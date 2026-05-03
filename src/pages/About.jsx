export default function About() {
  return (
    <div className="text-midnight">

      {/* ── What we're building ───────────────────────────────────────── */}
      <section className="px-8 pt-16 pb-24">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-serif text-3xl mb-8">
            What we're building.
          </h1>
          <div className="space-y-5 text-base leading-relaxed text-midnight/80 max-w-prose">
            <p>
              Arkidel is a compliance suite built for the small or solo privacy and compliance functions inside startups and growing companies. Our first module, Breach Clock, is a triage tool for breach notification deadlines across multiple jurisdictions. The next module is a DPIA/PIA workflow. After that, more modules in the categories most useful to privacy professionals at companies that take data governance seriously.
            </p>
            <p>
              Arkidel is built and maintained by qualified attorneys with substantive privacy and data protection experience. We're independently operated and bootstrapped. No venture capital, no growth-at-all-costs incentives, no roadmap dictated by the metrics a Series B board wants to see.
            </p>
          </div>
        </div>
      </section>

      {/* ── Why we started this ──────────────────────────────────────── */}
      <section className="border-t border-midnight/10 px-8 py-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-serif text-3xl mb-8">
            Why we started this.
          </h2>
          <div className="space-y-5 text-base leading-relaxed text-midnight/80 max-w-prose">
            <p>
              We started Arkidel because the middle ground didn't exist.
            </p>
            <p>
              Privacy professionals at small companies have two real options today. They can pay for enterprise platforms designed for Fortune 500 privacy offices — software that costs tens of thousands of dollars a year, takes months to deploy, and assumes a team of compliance specialists to operate. Or they can stitch together ad-hoc workflows out of spreadsheets, statutory text, and law-firm advisories — which works until something happens at 4:45 on a Friday and the cost of getting it wrong shows up in a regulator's inbox.
            </p>
            <p>
              Neither option is good. The first one is overbuilt and overpriced for the real shape of small-company privacy work. The second one creates real risk and burns the time of professionals who should be doing higher-leverage work. We're building the thing that should exist between them: software that's substantively reliable, priced to fit small-company budgets, and designed for professionals who already know what they're doing.
            </p>
          </div>
        </div>
      </section>

      {/* ── How we work ──────────────────────────────────────────────── */}
      <section className="border-t border-midnight/10 px-8 py-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-serif text-3xl mb-8">
            How we work.
          </h2>
          <div className="space-y-5 text-base leading-relaxed text-midnight/80 max-w-prose">
            <p>
              <strong className="font-semibold text-midnight">Quality over coverage.</strong>{" "}We'd rather model seven jurisdictions correctly than fifty jurisdictions sloppily. Every rule in our engine is verified against primary statutory sources and trusted secondary references, with a documented audit trail behind each substantive change.
            </p>
            <p>
              <strong className="font-semibold text-midnight">Pricing that fits small companies.</strong>{" "}Arkidel is priced for the privacy and compliance functions that actually exist at startups and growing companies — not for enterprise procurement. The Breach Clock is free during our soft-launch period; future modules will be priced reasonably and predictably.
            </p>
            <p>
              <strong className="font-semibold text-midnight">Visible methodology.</strong>{" "}Most compliance software asks you to trust that the rules behind it are correct. We think you should be able to see the work. Our rules engine ships with a public test harness — fifty cases covering threshold boundaries, dependent deadlines, and encryption suppression — that you can run yourself. Citations link to primary sources. The shape of the analysis is legible.
            </p>
          </div>
        </div>
      </section>

      {/* ── Get in touch ─────────────────────────────────────────────── */}
      <section className="border-t border-midnight/10 px-8 py-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-serif text-3xl mb-8">
            Get in touch.
          </h2>
          <div className="text-base leading-relaxed text-midnight/80 max-w-prose">
            <p>
              Questions, suggestions, or interest in early access to upcoming modules — we'd like to hear from you at{" "}
              <a
                href="mailto:hello@arkidel.com"
                className="text-midnight underline underline-offset-2 decoration-midnight/40 hover:decoration-midnight transition-colors"
              >
                hello@arkidel.com
              </a>
              .
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
