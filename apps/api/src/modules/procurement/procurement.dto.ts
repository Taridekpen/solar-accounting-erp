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

export class CreateSupplierDto {
  @IsString()
  @MinLength(2)
  businessName!: string;

  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  taxIdentifier?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  accountNumber?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  businessName?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  taxIdentifier?: string;

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

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  accountName?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  accountNumber?: string;
}

export class RequisitionLineDto {
  @IsUUID()
  productId!: string;

  @Matches(MONEY)
  quantity!: string;

  @Matches(MONEY)
  estimatedUnitCost!: string;
}

export class CreateRequisitionDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @MinLength(2)
  purpose!: string;

  @Matches(DATE)
  requiredDate!: string;

  @IsOptional()
  @IsIn(["low", "normal", "high"])
  priority?: "low" | "normal" | "high";

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequisitionLineDto)
  lines!: RequisitionLineDto[];
}

export class OrderLineDto {
  @IsUUID()
  productId!: string;

  @Matches(MONEY)
  quantity!: string;

  @Matches(MONEY)
  unitCost!: string;

  @IsOptional()
  @Matches(MONEY)
  discount?: string;

  @IsOptional()
  @Matches(MONEY)
  taxRate?: string;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  supplierId!: string;

  @IsIn(["central", "branch"])
  procurementMode!: "central" | "branch";

  @Matches(DATE)
  expectedDeliveryDate!: string;

  @IsOptional()
  @IsUUID()
  requisitionId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines!: OrderLineDto[];
}

export class ReceiptLineDto {
  @IsUUID()
  purchaseOrderLineId!: string;

  @Matches(MONEY)
  acceptedQuantity!: string;

  @IsOptional()
  @Matches(MONEY)
  rejectedQuantity?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialNumbers?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  warrantyMonths?: number;
}

export class CreateReceiptDto {
  @IsUUID()
  purchaseOrderId!: string;

  @Matches(DATE)
  receiptDate!: string;

  @IsOptional()
  @IsString()
  deliveryDocument?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];
}

export class BillLineDto {
  @IsUUID()
  purchaseOrderLineId!: string;

  @Matches(MONEY)
  quantity!: string;

  @Matches(MONEY)
  unitCost!: string;

  @IsOptional()
  @Matches(MONEY)
  taxRate?: string;
}

export class CreateBillDto {
  @IsUUID()
  purchaseOrderId!: string;

  @IsString()
  @MinLength(2)
  supplierInvoiceNumber!: string;

  @Matches(DATE)
  invoiceDate!: string;

  @IsOptional()
  @Matches(DATE)
  dueDate?: string;

  @IsString()
  @MinLength(1)
  attachmentName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BillLineDto)
  lines!: BillLineDto[];
}

export class PaymentAllocationDto {
  @IsUUID()
  billId!: string;

  @Matches(MONEY)
  amount!: string;
}

export class CreatePaymentDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  supplierId!: string;

  @Matches(DATE)
  paymentDate!: string;

  @IsIn(["cash", "bank_transfer"])
  method!: "cash" | "bank_transfer";

  @Matches(MONEY)
  total!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations!: PaymentAllocationDto[];
}

export class ApplyDepositDto {
  @IsUUID()
  billId!: string;

  @Matches(MONEY)
  amount!: string;

  @Matches(DATE)
  paymentDate!: string;
}
