// Open right-facing caret — a functional disclosure marker derived from the
// Arkidel rune's angle strokes (ArkidelLogo.jsx: the two diagonals
// (50,38)→(72,28) and (50,62)→(72,72)). Each arm here is a verbatim-scale copy
// of one of those strokes — run 22 × rise 10 (≈24.4° off horizontal, ≈48.9°
// between the arms) — joined at a shared right-hand vertex, with the same
// stroke system: width 6, round caps, and a round join per the family
// convention (the frame, triangle, and module figures all join round; the
// standalone diagonals carry no join of their own). The tight 34×32 viewBox
// keeps that stroke weight legible at small UI sizes, where the siblings'
// 100-unit shell would thin it to a hairline.
//
// Uses currentColor like its siblings — the surrounding `color` drives the
// stroke; no hardcoded fill. Rotation (e.g. rotate(90deg) for an expanded
// disclosure) is applied by the caller via `style`, as with sizing.
export default function ArkidelCaret({ className, style, title }) {
  const a11yProps = title ? { role: "img" } : { "aria-hidden": "true" };
  return (
    <svg viewBox="0 0 34 32" xmlns="http://www.w3.org/2000/svg" {...a11yProps} className={className} style={style}>
      {title ? <title>{title}</title> : null}
      <path d="M 6 6 L 28 16 L 6 26" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
