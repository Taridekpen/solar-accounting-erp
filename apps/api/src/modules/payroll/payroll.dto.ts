import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d+(\.\d{1,4})?$/;

export class DeductionLineDto {
  @IsUUID()
  accountId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @Matches(MONEY)
  amount!: string;
}

export class CreateSalarySummaryDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @Matches(DATE)
  periodStart!: string;

  @Matches(DATE)
  periodEnd!: string;

  @Matches(MONEY)
  grossAmount!: string;

  @Matches(MONEY)
  netAmount!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  approvalReference!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  summaryFileName!: string;

  @IsString()
  @MinLength(1)
  summaryFileBase64!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeductionLineDto)
  deductions!: DeductionLineDto[];
}

export class PaymentAllocationDto {
  @IsUUID()
  summaryId!: string;

  @Matches(MONEY)
  amount!: string;
}

export class CreateSalaryPaymentDto {
  @IsUUID()
  branchId!: string;

  @Matches(DATE)
  paymentDate!: string;

  @IsUUID()
  paymentAccountId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  bankReference!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
}
