import { assertDecimalString, formatMoney } from "@solar/shared";
import { POSTING_EVENTS } from "@solar/accounting-rules";
import { formatMoneyUnits, parseMoney } from "../accounting/money";
import { parseCsv } from "./csv";
import { IMPORT_TYPES } from "./imports.dto";

describe("Section 16 unit pack", () => {
  it("parses CSV rows and quoted commas", () => {
    const { headers, rows } = parseCsv('customerCode,name\n"C-1","Acme, Lagos"\nC-2,Beta');
    expect(headers).toEqual(["customerCode", "name"]);
    expect(rows).toEqual([
      { customerCode: "C-1", name: "Acme, Lagos" },
      { customerCode: "C-2", name: "Beta" },
    ]);
  });

  it("keeps money helpers and shared Naira formatting aligned", () => {
    expect(formatMoneyUnits(parseMoney("12.5000"))).toBe("12.5000");
    expect(() => assertDecimalString("12.5000")).not.toThrow();
    expect(formatMoney("12.5000")).toContain("12.50");
  });

  it("exposes the staged import types and posting event catalog", () => {
    expect(IMPORT_TYPES).toContain("opening_trial_balance");
    expect(IMPORT_TYPES).toContain("customers");
    expect(POSTING_EVENTS.length).toBeGreaterThan(5);
    expect(POSTING_EVENTS.some((event) => event.code.includes("sale") || event.code.includes("cash"))).toBe(true);
  });
});
