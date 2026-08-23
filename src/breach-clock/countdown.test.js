// Tier boundaries for the magnitude-tiered countdown (JDC ruling 2026-08-23):
// exactly 7d / 24h / 1h, and one second either side of each, for remaining
// and overdue alike.

import { describe, expect, it } from "vitest";
import { countdownTier, formatCountdown, countdownIsLive } from "./countdown.js";

const S = 1000;
const H = 3600 * S;
const D = 24 * H;

describe("countdownTier boundaries", () => {
  it.each([
    [7 * D + S, "days"],
    [7 * D, "days"],
    [7 * D - S, "dayshrs"],
    [D + S, "dayshrs"],
    [D, "dayshrs"],
    [D - S, "hrsmins"],
    [H + S, "hrsmins"],
    [H, "hrsmins"],
    [H - S, "minsecs"],
    [0, "minsecs"],
  ])("%i ms → %s", (ms, tier) => {
    expect(countdownTier(ms)).toBe(tier);
    // Sign-insensitive: overdue magnitudes tier identically.
    expect(countdownTier(-ms)).toBe(tier);
  });
});

describe("formatCountdown", () => {
  it("≥ 7 days shows days only, remaining and overdue", () => {
    expect(formatCountdown(7 * D)).toBe("7d");
    expect(formatCountdown(7 * D + S)).toBe("7d");
    expect(formatCountdown(-(34 * D + 5 * H))).toBe("34d overdue");
  });

  it("24h to 7d shows days and zero-padded hours", () => {
    expect(formatCountdown(7 * D - S)).toBe("6d 23h");
    expect(formatCountdown(D)).toBe("1d 00h");
    expect(formatCountdown(D + S)).toBe("1d 00h");
    expect(formatCountdown(4 * D + H + 30 * 60 * S)).toBe("4d 01h");
    expect(formatCountdown(-(2 * D + 3 * H))).toBe("2d 03h overdue");
  });

  it("1h to 24h shows hours and zero-padded minutes", () => {
    expect(formatCountdown(D - S)).toBe("23h 59m");
    expect(formatCountdown(H)).toBe("1h 00m");
    expect(formatCountdown(H + S)).toBe("1h 00m");
    expect(formatCountdown(3 * H + 5 * 60 * S + 59 * S)).toBe("3h 05m");
  });

  it("under 1h shows minutes and zero-padded seconds", () => {
    expect(formatCountdown(H - S)).toBe("59m 59s");
    expect(formatCountdown(12 * 60 * S + 9 * S)).toBe("12m 09s");
    expect(formatCountdown(0)).toBe("0m 00s");
    expect(formatCountdown(-30 * S)).toBe("0m 30s overdue");
  });

  it("only the under-1h tier is live", () => {
    expect(countdownIsLive(H - S)).toBe(true);
    expect(countdownIsLive(H)).toBe(false);
    expect(countdownIsLive(-(H - S))).toBe(true);
  });
});
