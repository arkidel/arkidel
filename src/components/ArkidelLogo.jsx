// The canonical Arkidel rune-glyph. Single source of truth for the mark used
// in the header/footer wordmark, the favicon, and marketing surfaces. Uses
// currentColor so the surrounding `color` (e.g. text-parchment) drives the fill
// and stroke. Do not redraw or approximate this elsewhere — import it.
//
// `frame` (default true) draws the softened container box. Pass frame={false}
// to render only the inner mark — the stem, the two diagonals, and the
// left-pointing arrow — for surfaces that want the bare glyph as brand texture
// rather than a contained logo (e.g. the Landing hero watermark).
export default function ArkidelLogo({ className, frame = true }) {
  return (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className={className}>
      {frame && (
        <rect x="10" y="10" width="80" height="80" rx="8" fill="none" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" />
      )}
      <line x1="50" y1="22" x2="50" y2="78" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <line x1="50" y1="38" x2="72" y2="28" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <line x1="50" y1="62" x2="72" y2="72" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <path d="M 38 42 L 24 50 L 38 58 Z" fill="currentColor" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
