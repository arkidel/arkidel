import usePageTitle from "../usePageTitle.js";

export default function Terms() {
  usePageTitle("Terms of Service");
  return (
    <div className="max-w-3xl mx-auto px-8 py-16">
      <h1 className="font-serif text-4xl mb-2">Terms of Service</h1>
      <p className="text-sm text-midnight/50 mb-16">Placeholder — legal copy TBD</p>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Use of service</h2>
        <p>Acceptable use policy. Respond output is informational only and does not constitute legal advice.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Disclaimers</h2>
        <p>No attorney-client relationship is formed by using this service. No warranty on the accuracy or completeness of deadline calculations.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Limitation of liability</h2>
        <p>Scope of liability cap — to be drafted with counsel.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Changes to these terms</h2>
        <p>Notice period and effective date policy when terms are updated.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Contact</h2>
        <p>Email for legal questions — TBD.</p>
      </section>
    </div>
  );
}
