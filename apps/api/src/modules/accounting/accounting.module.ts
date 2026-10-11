import { Module, forwardRef } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { OrganizationModule } from "../organization/organization.module";
import { AccountingController } from "./accounting.controller";
import { AccountsService } from "./accounts.service";
import { AccountingPostingService } from "./posting.service";

@Module({
  imports: [OrganizationModule, forwardRef(() => AdminModule)],
  controllers: [AccountingController],
  providers: [AccountingPostingService, AccountsService],
  exports: [AccountsService, AccountingPostingService],
})
export class AccountingModule {}
