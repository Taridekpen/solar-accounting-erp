import { describe, expect, it } from "vitest";
import { visibleNavigation } from "./navigation";

describe("visibleNavigation", () => {
  it("shows the reference menu when every permission is granted", () => {
    expect(visibleNavigation("all").map((item) => item.label)).toContain("Chart of Accounts");
  });

  it("hides entries outside the supplied permissions", () => {
    const labels = visibleNavigation(["dashboard.view"]).map((item) => item.label);
    expect(labels).toEqual(["Dashboard"]);
  });
});
