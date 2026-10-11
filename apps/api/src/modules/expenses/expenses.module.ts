import { Module, forwardRef } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { AccountingModule } from "../accounting/accounting.module";
import { AuthModule } from "../auth/auth.module";
import { OrganizationModule } from "../organization/organization.module";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";

@Module({
  imports: [OrganizationModule, AccountingModule, AuthModule, forwardRef(() => AdminModule)],
  controllers: [ExpensesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
