// =============================================================================
// IAPP-CHART CHANGE TRIPWIRE
//
// Watches the IAPP "US State Breach Notification Chart" — the primary
// cross-check source for every U.S.-state entry in src/breach-clock/data.js —
// for any change to the published PDF, and shouts if it moves.
//
// What it does:
//   - GETs the public CDN asset (NO IAPP credentials — the asset is served
//     anonymously by Contentstack; verified 2026-06-11).
//   - Computes the sha256 of the bytes IN MEMORY and reads the content-length.
//     The PDF is never written to disk or committed anywhere — hash and discard.
//   - Compares both against the baselines parsed from docs/sources.md (that
//     file is the single source of truth for the expected values).
//
// Exit behavior:
//   - sha256 AND content-length match  -> "IAPP chart unchanged ..."  exit 0
//   - either mismatches                -> loud operator message       exit 1
//   - fetch error / unreadable / unparseable baseline -> loud         exit 1
// A broken checker must never be silently green.
//
// Run: node scripts/check-iapp-chart.mjs
// =============================================================================

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCES = path.join(ROOT, "docs", "sources.md");

const ASSET_URL =
  "https://assets.contentstack.io/v3/assets/bltd4dd5b2d705252bc/bltce14f03b577e3063/us_state_data_breach_notification_chart.pdf";
const RESOURCE_PAGE = "https://iapp.org/resources/article/state-data-breach-notification-chart";
const EDITION = "February 2026";

function die(lines) {
  const bar = "!".repeat(72);
  console.error("\n" + bar);
  for (const l of lines) console.error(l);
  console.error(bar + "\n");
  process.exit(1);
}

async function main() {
  // 1. Parse the baselines from docs/sources.md — one source of truth.
  let md;
  try {
    md = await readFile(SOURCES, "utf8");
  } catch (e) {
    die([
      `Could not read ${SOURCES}:`,
      `  ${e.message}`,
      "The tripwire cannot run without its baseline file.",
    ]);
  }
  const shaM = md.match(/baseline_sha256:\s*([0-9a-fA-F]{64})\b/);
  const lenM = md.match(/baseline_content_length:\s*(\d+)\b/);
  if (!shaM || !lenM) {
    die([
      "Could not parse the IAPP-chart baselines from docs/sources.md.",
      `  baseline_sha256 found:         ${shaM ? "yes" : "NO"}`,
      `  baseline_content_length found: ${lenM ? "yes" : "NO"}`,
      "Expected machine-readable lines (exact keys):",
      "  baseline_content_length: <digits>",
      "  baseline_sha256: <64 hex chars>",
    ]);
  }
  const baseSha = shaM[1].toLowerCase();
  const baseLen = parseInt(lenM[1], 10);

  // 2. Fetch the asset, hash in memory, read content-length.
  let res;
  try {
    res = await fetch(ASSET_URL, { redirect: "follow" });
  } catch (e) {
    die([
      "Fetch FAILED for the IAPP chart asset:",
      `  ${ASSET_URL}`,
      `  ${e.message}`,
      "Cannot verify the chart edition. Check network / CDN availability and re-run.",
    ]);
  }
  if (!res.ok) {
    die([
      `Unexpected HTTP ${res.status} ${res.statusText} fetching the IAPP chart asset:`,
      `  ${ASSET_URL}`,
      "Cannot verify the chart edition. The CDN path may have moved — investigate and re-run.",
    ]);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const gotSha = createHash("sha256").update(buf).digest("hex");
  const headerLenRaw = res.headers.get("content-length");
  const gotLen = headerLenRaw !== null ? parseInt(headerLenRaw, 10) : buf.length;
  const byteLen = buf.length;

  // 3. Compare both signals.
  const shaOk = gotSha === baseSha;
  const lenOk = gotLen === baseLen;

  if (shaOk && lenOk) {
    console.log(`IAPP chart unchanged (edition: ${EDITION})`);
    process.exit(0);
  }

  die(
    [
      "IAPP US STATE BREACH NOTIFICATION CHART MAY HAVE CHANGED.",
      "",
      `  content-length   baseline: ${baseLen}   observed: ${gotLen}   ${lenOk ? "match" : "MISMATCH"}`,
      `  sha256           baseline: ${baseSha}`,
      `                   observed: ${gotSha}   ${shaOk ? "match" : "MISMATCH"}`,
      byteLen !== gotLen ? `  (note: header content-length ${gotLen} != downloaded byte count ${byteLen})` : "",
      "",
      "ACTION REQUIRED:",
      `  1. Log in to IAPP and download the current chart PDF:`,
      `       ${RESOURCE_PAGE}`,
      `     (anonymous visitors get a legacy .xlsx; members get the PDF.)`,
      "  2. Open the PDF and check the colophon edition date ('Updated <Month Year>').",
      "  3. Diff it against the U.S.-state rules encoded in src/breach-clock/data.js and",
      "     trigger re-verification (the formal intake process) for any rule that changed.",
      "  4. Once reconciled, update baseline_content_length and baseline_sha256 in",
      "     docs/sources.md to the new edition and record the new colophon date.",
    ].filter(Boolean)
  );
}

main();
