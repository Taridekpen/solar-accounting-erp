import { BadRequestException, ForbiddenException } from "@nestjs/common";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type BranchScope = { type: "company" } | { type: "branches"; branchIds: string[] };

export function parseBranchScope(headers: Record<string, string | string[] | undefined>): BranchScope {
  const scope = singleHeader(headers, "x-branch-scope");
  const ids = singleHeader(headers, "x-branch-ids");
  if (scope && ids) {
    throw new BadRequestException("Send either X-Branch-Scope or X-Branch-Ids");
  }
  if (scope === "company") {
    return { type: "company" };
  }
  if (scope) {
    throw new BadRequestException("X-Branch-Scope must be company");
  }
  if (!ids) {
    throw new BadRequestException("Branch scope is required");
  }
  const branchIds = ids.split(",").map((value) => value.trim()).filter(Boolean);
  if (branchIds.length === 0 || branchIds.some((id) => !UUID_PATTERN.test(id))) {
    throw new BadRequestException("X-Branch-Ids must be a comma-separated list of UUIDs");
  }
  return { type: "branches", branchIds: [...new Set(branchIds)] };
}

export function assertBranchAllowed(scope: BranchScope, branchId: string): void {
  if (scope.type === "branches" && !scope.branchIds.includes(branchId)) {
    throw new ForbiddenException("Branch is outside the authorized scope");
  }
}

export function branchIdFilter(scope: BranchScope): { in: string[] } | undefined {
  return scope.type === "company" ? undefined : { in: scope.branchIds };
}

function singleHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
