import { useState } from "react";
import { Link } from "react-router-dom";
import usePageTitle from "../usePageTitle.js";

export default function Landing() {
  usePageTitle();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleWaitlistSubmit(e) {
    e.preventDefault();
    console.log("Waitlist signup:", email);
    setSubmitted(true);
  }

  return (
    <div className="text-midnight">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="px-8 pt-20 pb-24">
        <div className="max-w-3xl mx-auto w-full">
          <h1 className="font-serif text-4xl leading-snug mb-6 max-w-2xl">
            Compliance tools for privacy professionals who do the actual work.
          </h1>
          <p className="text-base leading-relaxed text-midnight/75 mb-10 max-w-prose">
            Arkidel makes reliable, attorney-built software for the small compliance functions inside startups and growing companies. Tools that respect what you already know, work the way you'd expect, and don't pretend to replace the judgment you bring to the job.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/breach-clock"
              className="inline-block bg-midnight text-bone px-6 py-3 text-sm font-medium no-underline rounded-lg hover:opacity-90 transition-opacity"
            >
              Try Breach Clock
            </Link>
            <a
              href="#waitlist"
              className="inline-block border border-midnight text-midnight px-6 py-3 text-sm font-medium no-underline rounded-lg hover:bg-parchment transition-colors"
            >
              Join the waiting list
            </a>
          </div>
        </div>
      </section>

      {/* ── Pillars ───────────────────────────────────────────────────── */}
      <section className="bg-midnight px-8 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-start gap-x-8 gap-y-12">
            <div className="border-t-2 border-parchment/30 pt-6">
              <span className="block font-mono text-xs tracking-wider text-parchment/60 mb-3">01</span>
              <h3 className="font-serif text-base text-bone mb-3">
                Built by privacy attorneys.
              </h3>
              <p className="text-sm leading-relaxed text-mist">
                Every Arkidel module is researched, written, and signed off by qualified privacy attorneys before it ships — not assembled by a developer working from blog posts. You're using a tool built by the people who do this work for a living.
              </p>
            </div>
            <div className="border-t-2 border-parchment/30 pt-6">
              <span className="block font-mono text-xs tracking-wider text-parchment/60 mb-3">02</span>
              <h3 className="font-serif text-base text-bone mb-3">
                We show our work.
              </h3>
              <p className="text-sm leading-relaxed text-mist">
                Behind every answer is a citation to the primary source it rests on — the statute, regulation, or guidance — with the date we last verified it. When you have to explain why, the reasoning is in the product, not stuck in someone's memory.
              </p>
            </div>
            <div className="border-t-2 border-parchment/30 pt-6">
              <span className="block font-mono text-xs tracking-wider text-parchment/60 mb-3">03</span>
              <h3 className="font-serif text-base text-bone mb-3">
                The form is the expertise.
              </h3>
              <p className="text-sm leading-relaxed text-mist">
                Each tool asks the questions that matter, in the order that matters, and rules out the ones that don't. The structure isn't a wrapper around the analysis — the structure <em className="italic">is</em> the analysis, encoded once and applied the same way every time.
              </p>
            </div>
            <div className="border-t-2 border-parchment/30 pt-6">
              <span className="block font-mono text-xs tracking-wider text-parchment/60 mb-3">04</span>
              <h3 className="font-serif text-base text-bone mb-3">
                Durable artifacts.
              </h3>
              <p className="text-sm leading-relaxed text-mist">
                You leave with documents your workflow actually runs on — exportable records, citations, and decision logs you can hand to counsel or produce later. Not a session you have to screenshot before it's gone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Breach Clock module ───────────────────────────────────────── */}
      <section className="border-t border-midnight/10 px-8 py-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-serif text-3xl mb-8">
            The first module is Breach Clock.
          </h2>
          <div className="space-y-5 text-base leading-relaxed text-midnight/80 max-w-prose">
            <p>
              Breach Clock is a triage tool for breach notification deadlines. Enter what you know — when you became aware, where the affected residents are, what kind of data was involved, whether encryption was applied — and Breach Clock returns the obligations that fire under each jurisdiction's rules, with primary-source citations and a downloadable memo you can share with your team or counsel.
            </p>
            <p>
              It's built for the moment a privacy professional or in-house counsel finds out about a possible incident at 4:45 on a Friday and needs to know how much time they have. Eight jurisdictions are modeled today: EU GDPR, UK GDPR, California, Texas, Colorado, Massachusetts, New York, and Virginia. More are on the way.
            </p>
            <p>
              Every rule is verified against primary statutory sources and trusted secondary references reviewed by qualified attorneys. The rules engine ships with a public test harness — fifty-one cases covering threshold boundaries, dependent deadlines, and encryption suppression — that you can run yourself. We think you should be able to see how the tool works, not just trust that it does.
            </p>
          </div>
          <Link
            to="/breach-clock"
            className="inline-block mt-8 text-sm text-midnight font-medium no-underline border-b border-midnight/30 hover:border-midnight pb-px transition-colors"
          >
            Try Breach Clock →
          </Link>
        </div>
      </section>

      {/* ── What's next + Waitlist ────────────────────────────────────── */}
      <section id="waitlist" className="border-t border-midnight/10 px-8 py-24" style={{ backgroundColor: "rgba(232,221,196,0.2)" }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="font-serif text-3xl mb-8">
            What's next.
          </h2>
          <div className="space-y-5 text-base leading-relaxed text-midnight/80 max-w-prose mb-12">
            <p>
              The compliance work that small teams actually do is broader than incident response. The next Arkidel module is a DPIA/PIA tool — a privacy impact assessment workflow that produces a defensible record without making you fight a form designed for a Fortune 500 privacy office. After that, more modules in the categories most useful to privacy professionals at growing companies.
            </p>
            <p>
              If you'd like to know when each module launches, leave your email below. We don't send marketing newsletters; you'll hear from us when there's something worth telling you.
            </p>
          </div>

          {submitted ? (
            <p className="text-sm text-midnight/60">Thanks, you're on the list.</p>
          ) : (
            <form onSubmit={handleWaitlistSubmit} className="flex flex-wrap gap-3 max-w-sm">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="flex-1 min-w-0 px-4 py-2 text-sm border border-midnight/25 rounded-lg bg-bone text-midnight placeholder:text-midnight/35 focus:outline-none focus:border-midnight/60 transition-colors"
              />
              <button
                type="submit"
                className="px-5 py-2 text-sm border border-midnight/40 rounded-lg text-midnight bg-transparent hover:border-midnight hover:bg-parchment transition-colors"
              >
                Join
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── Arkidel is a tool ─────────────────────────────────────────── */}
      <section className="border-t border-midnight/10 px-8 py-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-serif text-3xl mb-8">
            Arkidel is a tool, not a compliance program.
          </h2>
          <div className="space-y-5 text-base leading-relaxed text-midnight/80 max-w-prose">
            <p>
              Software can calculate deadlines, surface citations, generate documentation, and keep track of obligations. Software can't make legal judgments, assess substantive risk, or stand behind a notification decision when the regulator calls. The work that matters most in privacy compliance is still done by humans — by you and by the counsel you work with.
            </p>
            <p>
              Arkidel is built to make that human work faster and more reliable, not to replace it. We think the honest version of compliance software treats its users as professionals, gives them the information they need to do their jobs well, and stays out of the way of their judgment. That's the version we're building.
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
