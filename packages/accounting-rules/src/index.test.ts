import { describe, expect, it } from "vitest";
import { FINANCIAL_AUTHORITY, POSTING_ENGINE_SECTION, POSTING_EVENTS, postingEvent } from "./index";

describe("accounting rules boundary", () => {
  it("keeps financial authority on the API", () => {
    expect(FINANCIAL_AUTHORITY).toBe("api");
    expect(POSTING_ENGINE_SECTION).toBe(4);
    expect(postingEvent("cash_sale")?.debitAccountCode).toBe("1000");
    expect(POSTING_EVENTS.every((event) => event.code.length > 0)).toBe(true);
  });
});
