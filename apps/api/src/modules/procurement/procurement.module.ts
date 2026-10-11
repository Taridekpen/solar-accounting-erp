import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { OrganizationModule } from "../organization/organization.module";
import { ProcurementController } from "./procurement.controller";
import { ProcurementService } from "./procurement.service";
import { SuppliersService } from "./suppliers.service";

@Module({
  imports: [OrganizationModule, AccountingModule],
  controllers: [ProcurementController],
  providers: [SuppliersService, ProcurementService],
})
export class ProcurementModule {}
