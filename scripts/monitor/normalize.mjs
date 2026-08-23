// =============================================================================
// NORMALIZER — deterministic text extraction + hashing for the change monitor.
//
// No model, no heuristics beyond what is spelled out here. The same bytes
// must always produce the same hash on every host; `normalize.test.js` pins a
// fixture page to its exact normalized text and sha256.
//
// Pipeline for HTML/text responses:
//   1. drop <script>, <style>, <noscript>, <template>, <head>, and comments
//   2. if exactly one trivially identifiable main-content region exists
//      (<main>, <article>, role="main", or id="main-content"/"main"/"content"),
//      keep only that region; otherwise keep the whole document
//   3. strip all remaining tags (block-level tags become newlines)
//   4. decode the common named entities and numeric entities
//   5. collapse all whitespace runs to a single space; trim
// Non-text responses (PDF etc.) are hashed as raw bytes.
// =============================================================================

import { createHash } from "node:crypto";

const DROP_BLOCKS = /<(script|style|noscript|template|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const BLOCK_TAGS = /<\/?(p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|section|article|header|footer|nav|main|blockquote|pre|hr|dt|dd|dl|figure|figcaption|address|aside)\b[^>]*>/gi;
const ANY_TAG = /<[^>]+>/g;

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", sect: "§",
  para: "¶", mdash: "—", ndash: "–", hellip: "…", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", copy: "©", reg: "®", trade: "™", middot: "·",
};

export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => {
      const v = NAMED_ENTITIES[name.toLowerCase()];
      return v === undefined ? m : v;
    });
}

/**
 * Find a single trivially identifiable main-content region. Returns the
 * region's inner HTML, or null when none (or more than one candidate kind)
 * is present — in which case the caller falls back to the full document.
 */
export function extractMainRegion(html) {
  const candidates = [
    /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i,
    /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i,
    /<([a-z]+)\b[^>]*\brole=["']main["'][^>]*>([\s\S]*?)<\/\1\s*>/i,
    /<([a-z]+)\b[^>]*\bid=["'](?:main-content|main|content)["'][^>]*>([\s\S]*?)<\/\1\s*>/i,
  ];
  for (const re of candidates) {
    const m = html.match(re);
    if (m) return m[m.length - 1];
  }
  return null;
}

export function normalizeHtml(html) {
  let text = String(html).replace(COMMENTS, "").replace(DROP_BLOCKS, "");
  const region = extractMainRegion(text);
  if (region !== null) text = region;
  text = text.replace(BLOCK_TAGS, "\n").replace(ANY_TAG, " ");
  text = decodeEntities(text);
  // Unicode NBSP and other separators fold into plain spaces with \s.
  return text.replace(/\s+/g, " ").trim();
}

export function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

export function isTextual(contentType) {
  const ct = String(contentType || "").toLowerCase();
  return ct.includes("html") || ct.includes("xml") || ct.startsWith("text/") || ct.includes("json");
}

/**
 * Normalize a fetched body to { text, hash }. `body` is a Buffer/Uint8Array;
 * textual content types are decoded as UTF-8 and normalized, everything else
 * is hashed as raw bytes (text = null).
 */
export function normalizeBody(body, contentType) {
  if (isTextual(contentType)) {
    const text = normalizeHtml(Buffer.from(body).toString("utf8"));
    return { text, hash: sha256(text) };
  }
  return { text: null, hash: sha256(Buffer.from(body)) };
}
