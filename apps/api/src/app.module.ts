import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { validateEnv } from "./config/env.schema";
import { PrismaModule } from "./database/prisma.module";
import { RedisModule } from "./database/redis.module";
import { AccountingModule } from "./modules/accounting/accounting.module";
import { AuthModule } from "./modules/auth/auth.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { BankingModule } from "./modules/banking/banking.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { ClosingModule } from "./modules/closing/closing.module";
import { PayrollModule } from "./modules/payroll/payroll.module";
import { ExpensesModule } from "./modules/expenses/expenses.module";
import { HealthModule } from "./modules/health/health.module";
import { OrganizationModule } from "./modules/organization/organization.module";
import { ReferenceModule } from "./modules/reference/reference.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { ProcurementModule } from "./modules/procurement/procurement.module";
import { SalesModule } from "./modules/sales/sales.module";
import { AdminModule } from "./modules/admin/admin.module";
import { ImportsModule } from "./modules/imports/imports.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        autoLogging: process.env.NODE_ENV !== "test",
      },
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    DashboardModule,
    OrganizationModule,
    ReferenceModule,
    AccountingModule,
    SalesModule,
    ProcurementModule,
    InventoryModule,
    ExpensesModule,
    BankingModule,
    ProjectsModule,
    ReportsModule,
    ClosingModule,
    PayrollModule,
    AdminModule,
    ImportsModule,
    AuthModule,
  ],
})
export class AppModule {}
