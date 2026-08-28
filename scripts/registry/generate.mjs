#!/usr/bin/env node
// =============================================================================
// REGISTRY GENERATOR — static source truth for the change-monitoring pipeline.
//
// Change monitoring, stage 1 (JDC rulings 2026-08-23; registry architecture
// C). Reads `src/breach-clock/data.js` (READ-ONLY input — this script never
// writes to it) and emits `registry.json` at the repo root: one row per
// distinct source (jurisdiction × source_url), carrying the exact citation
// strings from data.js, the dot-paths of the rule fields that source
// supports, the attorney verification date, RULESET_VERSION, and the fetch
// mode the monitor must use.
//
// Determinism contract: identical data.js → byte-identical registry.json.
// Rows and fields are emitted in a fixed order, ids are derived from the
// jurisdiction id + citation (with a URL-hash suffix only on collision), and
// no generation timestamp is written. The CI drift check
// (.github/workflows/registry-drift.yml) regenerates on every push/PR and
// fails if the committed file does not match committed data.js.
//
// Usage:
//   node scripts/registry/generate.mjs           # write registry.json
//   node scripts/registry/generate.mjs --check   # exit 1 if registry.json is stale
// =============================================================================

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JURISDICTIONS, RULESET_VERSION } from "../../src/breach-clock/data.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REGISTRY_PATH = resolve(HERE, "../../registry.json");

// ── Attorney verification dates ──────────────────────────────────────────
// Each jurisdiction's `verified` field in data.js (JDC-authorized amendment,
// 2026-08-28) is the date of record, set as part of the protected-file
// sign-off when a conformance pass re-verifies that jurisdiction; the
// intake form's Sign-off section in docs/intake-forms.md carries the
// narrative. The generator reads the field — it carries no static truth of
// its own. A jurisdiction without a `verified` field fails generation
// loudly: a new jurisdiction must arrive with its verification date.

// ── Fetch mode ───────────────────────────────────────────────────────────
// Colorado's sources sit behind the LexisNexis auth wall (the codified C.R.S.
// is not fetchable without a session) — every Colorado row is "manual"
// pending a fetchable source (JDC ruling 2026-08-23). All other current
// jurisdictions fetch automatically.
export const MANUAL_JURISDICTIONS = Object.freeze(new Set(["co"]));

// Scalar (non-nested) obligation fields that a source substantiates. Nested
// objects (gating, harmGate, riskSuppression, conditionalGates) are expanded
// to their leaf paths. `source_url` itself is omitted — it is the row's key,
// not a rule the source supports.
const OBLIGATION_SKIP = new Set(["source_url"]);

function leafPaths(value, prefix) {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => leafPaths(item, `${prefix}[${i}]`));
  }
  if (value && typeof value === "object") {
    return Object.keys(value).flatMap((k) => leafPaths(value[k], `${prefix}.${k}`));
  }
  return [prefix];
}

function slugify(text) {
  return text
    .normalize("NFKD")
    .replace(/§/g, "s")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function shortHash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

/**
 * Build the registry rows from a JURISDICTIONS array. Pure; exported for
 * tests. Row order = jurisdiction order in data.js, then first appearance of
 * each source_url within the jurisdiction.
 */
export function buildRegistry(jurisdictions = JURISDICTIONS, rulesetVersion = RULESET_VERSION) {
  const rows = [];
  for (const jur of jurisdictions) {
    const verified = jur.verified;
    if (!verified) {
      throw new Error(`registry: no verification date recorded for jurisdiction "${jur.id}" — data.js must carry a \`verified\` field on every jurisdiction`);
    }
    const byUrl = new Map(); // source_url → { citations: Set, fields: [] }
    const touch = (url, citation, fields) => {
      if (!url) return;
      let entry = byUrl.get(url);
      if (!entry) {
        entry = { citations: [], fields: [] };
        byUrl.set(url, entry);
      }
      if (citation && !entry.citations.includes(citation)) entry.citations.push(citation);
      for (const f of fields) if (!entry.fields.includes(f)) entry.fields.push(f);
    };

    (jur.obligations || []).forEach((ob, i) => {
      const root = `${jur.id}.obligations[${i}]`;
      const fields = Object.keys(ob)
        .filter((k) => !OBLIGATION_SKIP.has(k))
        .flatMap((k) => leafPaths(ob[k], `${root}.${k}`));
      touch(ob.source_url, ob.citation, fields);
    });

    (jur.counselNotes || []).forEach((note, i) => {
      const root = `${jur.id}.counselNotes[${i}]`;
      const fields = Object.keys(note)
        .filter((k) => !OBLIGATION_SKIP.has(k))
        .flatMap((k) => leafPaths(note[k], `${root}.${k}`));
      touch(note.source_url, note.citation, fields);
    });

    const seenIds = new Set();
    for (const [url, entry] of byUrl) {
      const base = `${jur.id}-${slugify(entry.citations[0] || "source")}`;
      let id = base;
      if (seenIds.has(id)) id = `${base}-${shortHash(url)}`;
      seenIds.add(id);
      rows.push({
        id,
        jurisdiction: jur.id,
        citation: entry.citations[0],
        citations: entry.citations,
        source_url: url,
        rule_fields: entry.fields,
        verified_date: verified,
        ruleset_version: rulesetVersion,
        fetch_mode: MANUAL_JURISDICTIONS.has(jur.id) ? "manual" : "auto",
      });
    }
  }
  const ids = rows.map((r) => r.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("registry: duplicate ids after collision handling");
  }
  return rows;
}

export function renderRegistry(jurisdictions, rulesetVersion) {
  const rows = buildRegistry(jurisdictions, rulesetVersion);
  const doc = {
    $comment: "Generated by scripts/registry/generate.mjs from src/breach-clock/data.js. Do not edit by hand.",
    ruleset_version: rulesetVersion ?? RULESET_VERSION,
    sources: rows,
  };
  return JSON.stringify(doc, null, 2) + "\n";
}

export function readCommittedRegistry() {
  try {
    return readFileSync(REGISTRY_PATH, "utf8");
  } catch {
    return null;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const rendered = renderRegistry();
  if (process.argv.includes("--check")) {
    const committed = readCommittedRegistry();
    if (committed !== rendered) {
      console.error("registry.json is out of date with src/breach-clock/data.js — run `node scripts/registry/generate.mjs` and commit the result.");
      process.exit(1);
    }
    console.log(`registry.json matches data.js (${JSON.parse(rendered).sources.length} sources, ruleset ${RULESET_VERSION}).`);
  } else {
    writeFileSync(REGISTRY_PATH, rendered);
    console.log(`Wrote ${REGISTRY_PATH} (${JSON.parse(rendered).sources.length} sources, ruleset ${RULESET_VERSION}).`);
  }
}
