import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationModule } from "../organization/organization.module";
import { BankingController } from "./banking.controller";
import { BankingService } from "./banking.service";

@Module({
  imports: [OrganizationModule, AccountingModule, AuthModule],
  controllers: [BankingController],
  providers: [BankingService],
})
export class BankingModule {}
