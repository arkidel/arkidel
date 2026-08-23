// Normalizer determinism pin (change monitoring stage 1). The fixture page
// carries every hazard the normalizer is meant to neutralize — a timestamped
// comment, inline script/style, a nav and footer outside the main region,
// entity-encoded section signs, NBSPs, and ragged whitespace — and is pinned
// to its exact normalized text and sha256. Any change to the normalizer that
// moves this hash would silently mark every monitored source "changed" on the
// next run, so the pin is the contract.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeHtml, normalizeBody, extractMainRegion, sha256 } from "./normalize.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(resolve(HERE, "fixtures/statute-page.html"));

const EXPECTED_TEXT =
  "Section 3: Duty to report known security breach (a) A person or agency that maintains or stores, but does not own or license data that includes personal information about a resident of the commonwealth, shall provide notice, as soon as practicable and without unreasonable delay, when such person or agency knows or has reason to know of a breach of security… (b) See also § 1 and § 3A. Amended by St. 2018, c. 444. Col A Col B";

const EXPECTED_HASH = "0bb99fdd47c681c2189780d0e9c493f70fcca18574db1093fadde928694530b4";

describe("normalizeHtml", () => {
  it("pins the fixture page to its exact normalized text", () => {
    expect(normalizeHtml(fixture.toString("utf8"))).toBe(EXPECTED_TEXT);
  });

  it("pins the fixture page to its exact sha256", () => {
    const { text, hash } = normalizeBody(fixture, "text/html; charset=utf-8");
    expect(text).toBe(EXPECTED_TEXT);
    expect(hash).toBe(EXPECTED_HASH);
    expect(hash).toBe(sha256(EXPECTED_TEXT));
  });

  it("is invariant to the volatile parts of the page", () => {
    const variant = fixture
      .toString("utf8")
      .replace("2026-08-23T01:02:03Z", "2026-08-24T09:00:00Z")
      .replace("dataLayer.push({ ts: Date.now() })", "dataLayer.push({ ts: 1 })")
      .replace("<nav class=\"nav\">", "<nav class=\"nav\" data-build=\"xyz\">");
    expect(normalizeHtml(variant)).toBe(EXPECTED_TEXT);
  });

  it("falls back to the full document when no main region is identifiable", () => {
    expect(extractMainRegion("<div><p>a</p></div>")).toBeNull();
    expect(normalizeHtml("<html><body><div><p>a</p><p>b &amp; c</p></div></body></html>")).toBe("a b & c");
  });

  it("hashes non-textual bodies as raw bytes", () => {
    const pdf = Buffer.from("%PDF-1.4 fake");
    const { text, hash } = normalizeBody(pdf, "application/pdf");
    expect(text).toBeNull();
    expect(hash).toBe(sha256(pdf));
  });
});
