import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { OrganizationModule } from "../organization/organization.module";
import { CustomersService } from "./customers.service";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [OrganizationModule, AccountingModule],
  controllers: [SalesController],
  providers: [CustomersService, SalesService],
})
export class SalesModule {}
