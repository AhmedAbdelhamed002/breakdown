import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate } from "./format";

describe("formatCurrency", () => {
  it("formats a number as EGP currency with no decimals", () => {
    expect(formatCurrency(1000)).toMatch(/^EGP\s1,000$/);
  });
});

describe("formatDate", () => {
  it("formats an ISO date as en-GB", () => {
    expect(formatDate("2026-01-15")).toBe("15/01/2026");
  });
});
