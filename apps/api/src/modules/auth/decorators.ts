import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "isPublic";
export const ALLOW_PENDING_MFA = "allowPendingMfa";
export const REQUIRED_PERMISSIONS = "requiredPermissions";

export const Public = () => SetMetadata(IS_PUBLIC, true);
export const AllowPendingMfa = () => SetMetadata(ALLOW_PENDING_MFA, true);
export const RequirePermissions = (...permissions: string[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);
