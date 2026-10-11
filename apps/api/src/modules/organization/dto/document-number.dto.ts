import { IsIn, IsString, IsUUID } from "class-validator";

export const DOCUMENT_TYPE_VALUES = [
  "sales_invoice",
  "quotation",
  "purchase_order",
  "goods_receipt",
  "customer_receipt",
  "supplier_payment",
  "expense",
  "journal",
  "project",
  "customer",
  "credit_note",
  "supplier",
  "requisition",
  "supplier_bill",
  "stock_transfer",
  "stock_count",
  "bank_transfer",
  "cash_count",
  "fixed_asset",
  "salary_summary",
  "salary_payment",
] as const;

export class AllocateDocumentNumberDto {
  @IsUUID()
  branchId!: string;

  @IsIn(DOCUMENT_TYPE_VALUES)
  documentType!: (typeof DOCUMENT_TYPE_VALUES)[number];
}

export class ChangeStatusDto {
  @IsIn(["active", "inactive"])
  status!: "active" | "inactive";
}
