import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, Min, MinLength } from "class-validator";

const MONEY = /^\d+(\.\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateExpenseDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @Matches(DATE)
  expenseDate!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @Matches(MONEY)
  amount!: string;

  @IsOptional()
  @Matches(MONEY)
  taxAmount?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @MinLength(1)
  receiptName!: string;

  @IsString()
  @MinLength(1)
  receiptBase64!: string;
}

export class PayExpenseDto {
  @IsUUID()
  paymentAccountId!: string;

  @Matches(DATE)
  paymentDate!: string;
}

export class CreateExpensePolicyDto {
  @Matches(MONEY)
  minAmount!: string;

  @IsOptional()
  @Matches(MONEY)
  maxAmount?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  roleCode?: string;

  @IsOptional()
  @IsBoolean()
  companyWide?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  level!: number;

  @IsOptional()
  @IsBoolean()
  requiresBudget?: boolean;
}

export class CreateExpenseBudgetDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  categoryId!: string;

  @Matches(DATE)
  budgetMonth!: string;

  @Matches(MONEY)
  amount!: string;
}

export class ExpenseReportQueryDto {
  @IsOptional()
  @Matches(DATE)
  from?: string;

  @IsOptional()
  @Matches(DATE)
  to?: string;
}
