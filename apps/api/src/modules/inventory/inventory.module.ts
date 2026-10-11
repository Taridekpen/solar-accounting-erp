import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { OrganizationModule } from "../organization/organization.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [OrganizationModule, AccountingModule],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}
