import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import { BranchScope } from "./branch-scope";

@Injectable()
export class BranchScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ branchScope?: BranchScope }>();
    if (!request.branchScope) {
      throw new UnauthorizedException("Authentication is required");
    }
    return true;
  }
}

export const CurrentBranchScope = createParamDecorator((_data: unknown, ctx: ExecutionContext): BranchScope => {
  return ctx.switchToHttp().getRequest<{ branchScope: BranchScope }>().branchScope;
});
