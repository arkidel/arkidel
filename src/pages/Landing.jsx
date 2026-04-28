export default function Landing() {
  return (
    <div className="max-w-5xl mx-auto px-8 py-16">
      <h1 className="font-serif text-4xl mb-2">Landing page</h1>
      <p className="text-sm text-midnight/50 mb-16">Placeholder — copy TBD</p>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Hero</h2>
        <p>Headline, subheadline, and primary CTA button ("Start a breach analysis" → /breach-clock). Secondary CTA to learn more / scroll down.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">What is Arkidel?</h2>
        <p>Two-sentence product description. Compliance software built for small businesses who don't have a legal team.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Breach Clock feature card</h2>
        <p>What the Breach Clock does, which jurisdictions it covers (EU GDPR, UK GDPR, California, Texas, Colorado, New York, Illinois), and a CTA to launch it.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Why compliance tools?</h2>
        <p>Brief framing: breach notification fines, tight timelines, the cost of missing a deadline. Sets up the product need without overstating it.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Trust signals</h2>
        <p>Placeholder for social proof, jurisdiction count, or press mentions once available.</p>
      </section>
    </div>
  );
}
