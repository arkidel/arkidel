// Module-specific brand glyphs — exact siblings of the master rune in
// ArkidelLogo.jsx. They share a byte-identical SVG shell (viewBox, xmlns) and,
// when framed, the same softened container <rect>, so a module glyph sits in
// the family alongside the master mark. Each inner figure uses currentColor, so
// the surrounding `color` drives fill/stroke exactly like ArkidelLogo.
//
// This is one component keyed by module name — NOT a file per glyph. Adding a
// module later is a single entry in MODULE_FIGURES below and nothing else.
//
// Do not redraw the frame or the figures elsewhere — import this component. The
// frame attributes are transcribed verbatim from ArkidelLogo so the container
// stays identical; if the master frame ever changes, mirror it here too.

// The one extension point: lowercase module name -> inner figure. The figures
// are locked designs; their coordinates are exact. Attribute names are JSX
// camelCase (strokeWidth, etc.) to match ArkidelLogo and React; the values are
// transcribed unchanged.
const MODULE_FIGURES = {
  // Respond — outlined hourglass with a single filled grain at the waist
  // (open figure + one filled accent, matching the family's grammar).
  respond: (
    <>
      <path
        d="M28 26 L72 26 L50 50 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M28 74 L72 74 L50 50 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="4.5" fill="currentColor" />
    </>
  ),

  // Map — triangulation: three strokes with filled nodes at the vertices.
  map: (
    <>
      <line x1="50" y1="28" x2="28" y2="72" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <line x1="50" y1="28" x2="72" y2="72" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <line x1="28" y1="72" x2="72" y2="72" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <circle cx="50" cy="28" r="5" fill="currentColor" />
      <circle cx="28" cy="72" r="5" fill="currentColor" />
      <circle cx="72" cy="72" r="5" fill="currentColor" />
    </>
  ),

  // assess: <>…</>,  // figure not yet designed — add the entry when locked.
  // share:  <>…</>,  // figure not yet designed — add the entry when locked.
};

export default function ArkidelGlyph({ module, className, style, frame = true, title }) {
  const key = typeof module === "string" ? module.toLowerCase() : module;
  const figure = MODULE_FIGURES[key];

  // Unknown/undesigned module: render the frame alone, never throw. Warn in dev
  // so a typo or a not-yet-designed module surfaces during development.
  if (figure === undefined && import.meta.env.DEV) {
    console.warn(
      `ArkidelGlyph: no glyph defined for module "${module}". Rendering the frame alone.`
    );
  }

  // Accessibility mirrors ArkidelLogo's default: decorative unless given a
  // title. A title makes the glyph an image with an accessible name.
  const a11yProps = title ? { role: "img" } : { "aria-hidden": "true" };

  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...a11yProps} className={className} style={style}>
      {title ? <title>{title}</title> : null}
      {frame && (
        <rect x="10" y="10" width="80" height="80" rx="8" fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
      )}
      {figure ?? null}
    </svg>
  );
}
