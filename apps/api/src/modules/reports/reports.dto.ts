import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Min, MinLength } from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d+(\.\d{1,4})?$/;
const LINE = ["revenue", "returns", "cost_of_sales", "operating", "finance", "other_income", "tax_expense"] as const;

export class ReportRangeDto {
  @Matches(DATE)
  from!: string;

  @Matches(DATE)
  to!: string;

  @IsOptional()
  @IsIn(["period", "month", "ytd", "branch", "budget"])
  mode?: "period" | "month" | "ytd" | "branch" | "budget";

  @IsOptional()
  @Matches(DATE)
  compareFrom?: string;

  @IsOptional()
  @Matches(DATE)
  compareTo?: string;

  @IsOptional()
  @IsIn(["json", "csv", "pdf", "xlsx"])
  format?: "json" | "csv" | "pdf" | "xlsx";
}

export class AsOfDto {
  @Matches(DATE)
  asOf!: string;

  @IsOptional()
  @IsIn(["json", "csv", "pdf", "xlsx"])
  format?: "json" | "csv" | "pdf" | "xlsx";
}

export class LedgerQueryDto extends ReportRangeDto {
  @IsUUID()
  accountId!: string;
}

export class CreateStatementBudgetDto {
  @IsUUID()
  branchId!: string;

  @Matches(DATE)
  budgetMonth!: string;

  @IsIn(LINE)
  lineCode!: (typeof LINE)[number];

  @Matches(MONEY)
  amount!: string;
}

export class CreateFixedAssetDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  category!: string;

  @Matches(DATE)
  acquisitionDate!: string;

  @Matches(MONEY)
  cost!: string;

  @IsInt()
  @Min(1)
  usefulLifeMonths!: number;

  @IsUUID()
  paymentAccountId!: string;
}

export class DisposeFixedAssetDto {
  @Matches(DATE)
  disposalDate!: string;

  @Matches(MONEY)
  proceeds!: string;

  @IsUUID()
  receiptAccountId!: string;
}

export class AssetDateDto {
  @Matches(DATE)
  accountingDate!: string;
}

export class CreateTaxCodeDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(["output", "input", "withholding"])
  kind!: "output" | "input" | "withholding";

  @Matches(MONEY)
  rate!: string;

  @Matches(DATE)
  effectiveFrom!: string;

  @IsOptional()
  @Matches(DATE)
  effectiveTo?: string;

  @IsUUID()
  accountId!: string;
}

export class TaxPaymentDto {
  @IsUUID()
  taxCodeId!: string;

  @Matches(MONEY)
  amount!: string;

  @Matches(DATE)
  accountingDate!: string;

  @IsUUID()
  paymentAccountId!: string;
}
