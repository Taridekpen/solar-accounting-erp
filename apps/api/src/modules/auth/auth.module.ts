import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JobsModule } from "../../jobs/jobs.module";
import { AccessGuard } from "./access.guard";
import { ApprovalService } from "./approval.service";
import { AuditService } from "./audit.service";
import { AuditController, AuditReadService, AuthController, ApprovalController, UsersController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthorizedJobProcessor, JobAuthorizationService } from "./job-authorization.service";
import { UsersService } from "./users.service";

@Module({
  imports: [JobsModule],
  controllers: [AuthController, UsersController, ApprovalController, AuditController],
  providers: [
    AuthService,
    UsersService,
    ApprovalService,
    AuditService,
    AuditReadService,
    JobAuthorizationService,
    AuthorizedJobProcessor,
    AccessGuard,
    { provide: APP_GUARD, useExisting: AccessGuard },
  ],
  exports: [AuthService, JobAuthorizationService, AuditService],
})
export class AuthModule {}
