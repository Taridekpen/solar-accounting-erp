import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const DOCUMENT_KINDS = [
  "invoice_attachment",
  "supplier_bill",
  "receipt",
  "purchase_order",
  "delivery_note",
  "bank_statement",
  "project_document",
  "adjustment_evidence",
  "logo",
  "other",
] as const;

export class UpdateDocumentTemplatesDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  invoiceFooter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  quotationTerms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  paymentAdvice?: string;
}

export class UpdateAccountMappingDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  eventCode!: string;

  @IsUUID()
  debitAccountId!: string;

  @IsUUID()
  creditAccountId!: string;

  @IsOptional()
  @IsUUID()
  taxAccountId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxSide?: string | null;
}

export class CreateAdminTaxCodeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(["output", "input", "withholding"])
  kind!: "output" | "input" | "withholding";

  @IsNumberString()
  rate!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsUUID()
  accountId!: string;
}

export class CreateAdminExpensePolicyDto {
  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsNumberString()
  minAmount!: string;

  @IsNumberString()
  maxAmount!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  level!: number;

  @IsBoolean()
  companyWide!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleCode?: string;

  @IsOptional()
  @IsBoolean()
  requiresBudget?: boolean;
}

export class CreateSeparationRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  action!: string;
}

export class UploadDocumentDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  entityType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  entityId!: string;

  @IsIn(DOCUMENT_KINDS as unknown as string[])
  documentKind!: (typeof DOCUMENT_KINDS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(260)
  fileName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  mimeType!: string;

  @IsString()
  @MinLength(1)
  contentBase64!: string;
}

export class AuditQueryDto {
  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;
}

export class DocumentListQueryDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  documentKind?: string;
}

export { DOCUMENT_KINDS };
