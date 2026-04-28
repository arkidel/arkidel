export default function About() {
  return (
    <div className="max-w-5xl mx-auto px-8 py-16">
      <h1 className="font-serif text-4xl mb-2">About</h1>
      <p className="text-sm text-midnight/50 mb-16">Placeholder — copy TBD</p>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Mission</h2>
        <p>What Arkidel is trying to accomplish and for whom. One paragraph, plain language.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">Why we built this</h2>
        <p>Founding story. The problem observed, the gap in market tools for small businesses, and the decision to build.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">The team</h2>
        <p>Founder bio(s) and credentials relevant to compliance and privacy law.</p>
      </section>

      <section className="mb-12">
        <h2 className="font-serif text-2xl mb-3">What's coming</h2>
        <p>Roadmap preview — the compliance modules planned beyond Breach Clock.</p>
      </section>
    </div>
  );
}
