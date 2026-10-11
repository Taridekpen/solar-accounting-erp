import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateNested,
} from "class-validator";

const MONEY = /^\d+(\.\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class JournalLineDto {
  @IsUUID()
  accountId!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsString()
  @Matches(MONEY)
  debit!: string;

  @IsString()
  @Matches(MONEY)
  credit!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ManualJournalDto {
  @IsString()
  @Matches(DATE)
  accountingDate!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @IsOptional()
  @IsBoolean()
  closedPeriodAdjustment?: boolean;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

export class PostEventDto {
  @IsString()
  eventCode!: string;

  @IsString()
  sourceDocumentType!: string;

  @IsUUID()
  sourceDocumentId!: string;

  @IsString()
  @Matches(DATE)
  accountingDate!: string;

  @IsUUID()
  branchId!: string;

  @IsString()
  @Matches(MONEY)
  amount!: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY)
  taxAmount?: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @IsOptional()
  @IsString()
  debitAccountCode?: string;

  @IsOptional()
  @IsString()
  creditAccountCode?: string;

  @IsOptional()
  @IsBoolean()
  closedPeriodAdjustment?: boolean;
}

export class ReverseJournalDto {
  @IsString()
  @MinLength(2)
  reason!: string;
}

export class OpeningDetailDto {
  @IsIn(["cash", "bank", "inventory", "customer_invoice", "supplier_bill", "fixed_asset", "depreciation", "loan", "equity"])
  kind!: string;

  @IsString()
  accountCode!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY)
  quantity?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY)
  unitCost?: string;

  @IsString()
  @Matches(MONEY)
  amount!: string;

  @IsUUID()
  branchId!: string;
}

export class OpeningBalanceDto {
  @IsString()
  @Matches(DATE)
  accountingDate!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OpeningDetailDto)
  details!: OpeningDetailDto[];
}

export class CreateAccountDto {
  @IsString()
  @MinLength(2)
  accountCode!: string;

  @IsString()
  @MinLength(2)
  accountName!: string;

  @IsIn(["asset", "liability", "equity", "revenue", "expense"])
  accountType!: "asset" | "liability" | "equity" | "revenue" | "expense";

  @IsOptional()
  @IsString()
  accountSubtype?: string;

  @IsOptional()
  @IsUUID()
  parentAccountId?: string;

  @IsIn(["debit", "credit"])
  normalBalance!: "debit" | "credit";

  @IsOptional()
  @IsBoolean()
  isPostable?: boolean;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  accountName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPostable?: boolean;
}
