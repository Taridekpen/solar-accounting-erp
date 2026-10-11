import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const MONEY = /^\d+(\.\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateCustomerDto {
  @IsIn(["individual", "corporate"])
  customerType!: "individual" | "corporate";

  @IsString()
  @MinLength(2)
  name!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  taxIdentifier?: string;

  @IsOptional()
  @Matches(MONEY)
  creditLimit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  billingAddress?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  taxIdentifier?: string;

  @IsOptional()
  @Matches(MONEY)
  creditLimit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  branchIds?: string[];
}

export class DocumentLineDto {
  @IsUUID()
  productId!: string;

  @Matches(MONEY)
  quantity!: string;

  @IsOptional()
  @Matches(MONEY)
  unitPrice?: string;

  @IsOptional()
  @Matches(MONEY)
  discount?: string;

  @IsOptional()
  @Matches(MONEY)
  taxRate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialNumbers?: string[];
}

export class CreateQuotationDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  customerId!: string;

  @Matches(DATE)
  validityDate!: string;

  @IsOptional()
  @IsString()
  terms?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DocumentLineDto)
  lines!: DocumentLineDto[];
}

export class CreateInvoiceDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  customerId!: string;

  @Matches(DATE)
  invoiceDate!: string;

  @IsInt()
  @Min(0)
  paymentTermsDays!: number;

  @IsIn(["credit", "cash"])
  settlement!: "credit" | "cash";

  @IsOptional()
  @IsIn(["cash", "bank_transfer", "pos"])
  cashMethod?: "cash" | "bank_transfer" | "pos";

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DocumentLineDto)
  lines!: DocumentLineDto[];
}

export class ReceiptMethodDto {
  @IsIn(["cash", "bank_transfer", "pos"])
  method!: "cash" | "bank_transfer" | "pos";

  @Matches(MONEY)
  amount!: string;
}

export class ReceiptAllocationDto {
  @IsUUID()
  invoiceId!: string;

  @Matches(MONEY)
  amount!: string;
}

export class CreateReceiptDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  customerId!: string;

  @Matches(DATE)
  receiptDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiptMethodDto)
  methods!: ReceiptMethodDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationDto)
  allocations!: ReceiptAllocationDto[];
}

export class ApplyAdvanceDto {
  @IsUUID()
  invoiceId!: string;

  @Matches(MONEY)
  amount!: string;

  @Matches(DATE)
  receiptDate!: string;
}

export class ReturnLineDto {
  @IsUUID()
  invoiceLineId!: string;

  @Matches(MONEY)
  quantity!: string;
}

export class CreateReturnDto {
  @IsUUID()
  invoiceId!: string;

  @IsIn(["credit", "refund"])
  settlement!: "credit" | "refund";

  @IsOptional()
  @IsIn(["cash", "bank_transfer", "pos"])
  refundMethod?: "cash" | "bank_transfer" | "pos";

  @IsString()
  @MinLength(2)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines!: ReturnLineDto[];
}

export class InspectReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines!: ReturnLineDto[];
}
