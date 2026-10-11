import { periodBounds } from "./timezone";

describe("periodBounds", () => {
  it("uses the company timezone instead of UTC", () => {
    const now = new Date("2026-10-09T12:00:00.000Z");
    const range = periodBounds("this_month", "Africa/Lagos", now);

    expect(range.from).toBe("2026-09-30T23:00:00.000Z");
    expect(range.to).toBe("2026-10-31T22:59:59.999Z");
  });
});
