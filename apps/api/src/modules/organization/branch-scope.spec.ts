import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { assertBranchAllowed, branchIdFilter, parseBranchScope } from "./branch-scope";

describe("branch scope", () => {
  const branchA = "11111111-1111-4111-8111-111111111111";
  const branchB = "22222222-2222-4222-8222-222222222222";

  it("requires an explicit scope", () => {
    expect(() => parseBranchScope({})).toThrow(BadRequestException);
  });

  it("accepts company-wide access", () => {
    expect(parseBranchScope({ "x-branch-scope": "company" })).toEqual({ type: "company" });
    expect(branchIdFilter({ type: "company" })).toBeUndefined();
  });

  it("limits a branch query to the supplied identifiers", () => {
    const scope = parseBranchScope({ "x-branch-ids": branchA });
    expect(branchIdFilter(scope)).toEqual({ in: [branchA] });
    expect(() => assertBranchAllowed(scope, branchB)).toThrow(ForbiddenException);
    expect(() => assertBranchAllowed(scope, branchA)).not.toThrow();
  });
});
