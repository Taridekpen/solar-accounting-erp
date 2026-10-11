import { describe, expect, it } from "vitest";
import { formatMoney } from "./index";

describe("formatMoney", () => {
  it("formats naira with grouping and two decimal places", () => {
    expect(formatMoney("1250000")).toBe("₦1,250,000.00");
    expect(formatMoney("0")).toBe("₦0.00");
    expect(formatMoney("1250000.4")).toBe("₦1,250,000.40");
  });

  it("rounds half up with decimal arithmetic", () => {
    expect(formatMoney("10.005")).toBe("₦10.01");
  });

  it("preserves a negative sign outside the currency symbol", () => {
    expect(formatMoney("-10.5")).toBe("-₦10.50");
  });

  it("rejects values that are not decimal strings", () => {
    expect(() => formatMoney("12.50.1")).toThrow(/decimal strings/);
    expect(() => formatMoney("1e2")).toThrow(/decimal strings/);
  });
});
