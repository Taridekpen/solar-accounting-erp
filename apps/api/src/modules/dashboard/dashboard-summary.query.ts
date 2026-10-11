import { IsIn, IsISO8601, IsOptional } from "class-validator";
import { DashboardPreset } from "@solar/shared";

export const DASHBOARD_METRICS = [
  "sales",
  "purchases",
  "expenses",
  "gross-profit",
  "net-profit",
  "cash",
  "receivables",
  "payables",
  "inventory",
  "collections",
  "credit-sales",
  "daily-sales",
  "sales-month",
  "approvals",
  "projects",
  "low-stock",
  "overdue-invoices",
  "stock",
  "transfers",
  "installations",
  "daily-closing",
  "product-categories",
  "customer-aging",
  "supplier-aging",
  "inventory-categories",
  "project-profit",
] as const;

export class DashboardSummaryQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(["this_month", "this_year", "custom"])
  preset?: DashboardPreset;
}

export class DashboardDetailQueryDto extends DashboardSummaryQueryDto {
  @IsIn(DASHBOARD_METRICS)
  metric!: (typeof DASHBOARD_METRICS)[number];
}
