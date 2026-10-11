import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationModule } from "../organization/organization.module";
import { ReportsModule } from "../reports/reports.module";
import { ClosingController } from "./closing.controller";
import { ClosingService } from "./closing.service";

@Module({
  imports: [OrganizationModule, AccountingModule, AuthModule, ReportsModule],
  controllers: [ClosingController],
  providers: [ClosingService],
  exports: [ClosingService],
})
export class ClosingModule {}
