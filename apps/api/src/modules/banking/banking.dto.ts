import { IsIn, IsOptional, IsString, IsUUID, Matches, MinLength } from "class-validator";

const MONEY = /^\d+(\.\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SIGNED_MONEY = /^-?\d+(\.\d{1,4})?$/;

export class CreateBankAccountDto {
  @IsString()
  @MinLength(2)
  bankName!: string;

  @IsString()
  @MinLength(2)
  accountName!: string;

  @IsString()
  @MinLength(4)
  accountNumber!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateCashDrawerDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(["drawer", "petty"])
  kind!: "drawer" | "petty";

  @IsUUID()
  ledgerAccountId!: string;
}

export class CreateCashTransferDto {
  @IsIn(["branch_to_branch", "branch_to_head_office", "head_office_to_branch", "account_to_account", "deposit", "drawer"])
  kind!: "branch_to_branch" | "branch_to_head_office" | "head_office_to_branch" | "account_to_account" | "deposit" | "drawer";

  @IsUUID()
  sourceBranchId!: string;

  @IsUUID()
  destinationBranchId!: string;

  @IsUUID()
  sourceAccountId!: string;

  @IsUUID()
  destinationAccountId!: string;

  @Matches(MONEY)
  amount!: string;

  @Matches(DATE)
  sentDate!: string;

  @IsOptional()
  @Matches(DATE)
  receivedDate?: string;
}

export class CreateCashCountDto {
  @IsUUID()
  drawerId!: string;

  @Matches(DATE)
  countDate!: string;

  @Matches(MONEY)
  countedAmount!: string;
}

export class CreateBankStatementDto {
  @IsUUID()
  bankAccountId!: string;

  @Matches(DATE)
  periodStart!: string;

  @Matches(DATE)
  periodEnd!: string;

  @Matches(SIGNED_MONEY)
  statementEnding!: string;
}

export class BankStatementLineDto {
  @Matches(DATE)
  lineDate!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @Matches(SIGNED_MONEY)
  amount!: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class ImportStatementDto {
  @IsString()
  @MinLength(1)
  csv!: string;
}

export class MatchStatementDto {
  @IsUUID()
  statementLineId!: string;

  @IsUUID()
  journalLineId!: string;
}

export class BankAdjustmentDto {
  @IsIn(["charge", "interest"])
  kind!: "charge" | "interest";

  @Matches(MONEY)
  amount!: string;

  @Matches(DATE)
  accountingDate!: string;
}

export class CashBookQueryDto {
  @IsOptional()
  @Matches(DATE)
  from?: string;

  @IsOptional()
  @Matches(DATE)
  to?: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  sourceType?: string;
}
