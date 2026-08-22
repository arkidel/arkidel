// Timezone-explicit awareness — resolution and display (serverless bundle,
// JDC 2026-08-22). These pin the DST decisions documented in timezone.js:
// EARLIEST INSTANT WINS in both directions, deterministically, on any host.
import { describe, it, expect } from "vitest";
import {
  zonedWallClockToInstant,
  parseWallClock,
  isValidTimeZone,
  zoneLabel,
  formatDateTimeInZone,
  formatLongDateTimeInZone,
  formatDateInZone,
  toDateTimeLocalInZone,
  COMMON_US_ZONES,
  allTimeZones,
} from "./timezone.js";

const iso = (ms) => (ms === null ? null : new Date(ms).toISOString());

describe("zonedWallClockToInstant", () => {
  it("resolves an ordinary wall time in the declared zone, not the host's", () => {
    expect(iso(zonedWallClockToInstant("2026-09-30T10:00", "America/Chicago"))).toBe("2026-09-30T15:00:00.000Z");
    expect(iso(zonedWallClockToInstant("2026-09-30T10:00", "America/New_York"))).toBe("2026-09-30T14:00:00.000Z");
    expect(iso(zonedWallClockToInstant("2026-09-30T10:00", "Asia/Kolkata"))).toBe("2026-09-30T04:30:00.000Z");
    expect(iso(zonedWallClockToInstant("2026-09-30T10:00", "UTC"))).toBe("2026-09-30T10:00:00.000Z");
  });

  it("spring-forward: a NONEXISTENT local time resolves to the earlier candidate instant", () => {
    // America/Chicago, 2026-03-08: clocks jump 02:00 CST → 03:00 CDT (08:00Z).
    // 02:30 never occurs. Candidates: 08:30Z (naive − CST offset, which the
    // zone displays as 03:30 CDT) and 07:30Z (naive − CDT offset, displayed
    // as 01:30 CST). Neither round-trips; the EARLIER instant, 07:30Z, wins —
    // the conservative side, since every deadline is awareness + N hours.
    expect(iso(zonedWallClockToInstant("2026-03-08T02:30", "America/Chicago"))).toBe("2026-03-08T07:30:00.000Z");
    // The minute before the gap and the minute after it resolve normally.
    expect(iso(zonedWallClockToInstant("2026-03-08T01:59", "America/Chicago"))).toBe("2026-03-08T07:59:00.000Z");
    expect(iso(zonedWallClockToInstant("2026-03-08T03:00", "America/Chicago"))).toBe("2026-03-08T08:00:00.000Z");
    // Same rule in a European zone: Europe/London 2026-03-29 01:00 GMT → 02:00 BST.
    expect(iso(zonedWallClockToInstant("2026-03-29T01:30", "Europe/London"))).toBe("2026-03-29T00:30:00.000Z");
  });

  it("fall-back: an AMBIGUOUS local time resolves to its FIRST occurrence (daylight offset)", () => {
    // America/Chicago, 2026-11-01: clocks fall 02:00 CDT → 01:00 CST (07:00Z).
    // 01:30 occurs twice — 06:30Z (CDT) then 07:30Z (CST). Both round-trip;
    // the earlier, 06:30Z, wins.
    expect(iso(zonedWallClockToInstant("2026-11-01T01:30", "America/Chicago"))).toBe("2026-11-01T06:30:00.000Z");
    // Unambiguous neighbours.
    expect(iso(zonedWallClockToInstant("2026-11-01T00:59", "America/Chicago"))).toBe("2026-11-01T05:59:00.000Z");
    expect(iso(zonedWallClockToInstant("2026-11-01T02:00", "America/Chicago"))).toBe("2026-11-01T08:00:00.000Z");
  });

  it("is deterministic: the same pair yields the same instant on repeated calls", () => {
    const a = zonedWallClockToInstant("2026-11-01T01:30", "America/Chicago");
    const b = zonedWallClockToInstant("2026-11-01T01:30", "America/Chicago");
    expect(a).toBe(b);
  });

  it("carries seconds and milliseconds through", () => {
    expect(iso(zonedWallClockToInstant("2026-05-01T09:00:05.250", "UTC"))).toBe("2026-05-01T09:00:05.250Z");
  });

  it("returns null for an unusable string or zone — never a guessed instant", () => {
    expect(zonedWallClockToInstant("garbage", "UTC")).toBeNull();
    expect(zonedWallClockToInstant("2026-02-30T09:00", "UTC")).toBeNull();
    expect(zonedWallClockToInstant("2026-05-01T09:00", "Mars/Base")).toBeNull();
    expect(zonedWallClockToInstant("2026-05-01T09:00", "")).toBeNull();
    expect(zonedWallClockToInstant("2026-05-01T09:00", undefined)).toBeNull();
    expect(zonedWallClockToInstant(undefined, "UTC")).toBeNull();
  });
});

describe("parseWallClock / isValidTimeZone", () => {
  it("accepts the datetime-local shapes and rejects everything else", () => {
    expect(parseWallClock("2026-05-01T09:00")).toMatchObject({ year: 2026, month: 5, day: 1, hour: 9, minute: 0, second: 0, ms: 0 });
    expect(parseWallClock("2026-05-01T09:00:30")).toMatchObject({ second: 30 });
    expect(parseWallClock("2026-05-01 09:00")).toBeNull();
    expect(parseWallClock("2026-05-01T09:00:00Z")).toBeNull();
    expect(parseWallClock(42)).toBeNull();
  });
  it("recognizes IANA ids and rejects junk", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});

describe("display in the declared zone", () => {
  const t = new Date("2026-09-30T15:00:00Z");
  it("labels US zones with the generic short form and others with an offset form", () => {
    expect(zoneLabel(t, "America/Chicago")).toBe("CT");
    expect(zoneLabel(t, "America/New_York")).toBe("ET");
    expect(zoneLabel(t, "America/Phoenix")).toBe("MST");
    expect(zoneLabel(t, "Europe/London")).toBe("GMT+1");
    expect(zoneLabel(t, "UTC")).toBe("UTC");
  });
  it("renders the spec's example form: 9/30/2026, 10:00 AM CT", () => {
    expect(formatDateTimeInZone(t, "America/Chicago")).toBe("9/30/2026, 10:00 AM CT");
    expect(formatLongDateTimeInZone(t, "America/Chicago")).toBe("September 30, 2026 at 10:00 AM CT");
  });
  it("judges the calendar day in the declared zone", () => {
    const nearMidnight = new Date("2026-10-01T03:30:00Z"); // 10:30 PM Sep 30 in Chicago
    expect(formatDateInZone(nearMidnight, "America/Chicago")).toBe("Sep 30, 2026");
    expect(formatDateInZone(nearMidnight, "UTC")).toBe("Oct 1, 2026");
    expect(toDateTimeLocalInZone(nearMidnight, "America/Chicago")).toBe("2026-09-30T22:30");
  });
  it("falls to the viewer's zone when no zone is declared (legacy) — still labeled", () => {
    const out = formatDateTimeInZone(t, null);
    expect(out).toBe(`${t.toLocaleString("en-US", { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })} ${zoneLabel(t, null)}`);
    expect(zoneLabel(t, null).length).toBeGreaterThan(0);
  });
});

describe("zone vocabulary", () => {
  it("offers the common US group first and the full IANA list without duplicates", () => {
    expect(COMMON_US_ZONES.map((z) => z.id)).toContain("America/Chicago");
    const rest = allTimeZones();
    expect(rest.length).toBeGreaterThan(100);
    for (const z of COMMON_US_ZONES) expect(rest).not.toContain(z.id);
  });
});
