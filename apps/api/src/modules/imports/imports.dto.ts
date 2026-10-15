import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export const IMPORT_TYPES = [
  "chart_of_accounts",
  "customers",
  "suppliers",
  "products",
  "warehouse_opening_stock",
  "bank_opening_balances",
  "outstanding_invoices",
  "outstanding_bills",
  "fixed_assets",
  "opening_trial_balance",
] as const;

export type ImportType = (typeof IMPORT_TYPES)[number];

export class UploadImportDto {
  @IsIn(IMPORT_TYPES as unknown as string[])
  importType!: ImportType;

  @IsString()
  @MinLength(1)
  @MaxLength(260)
  fileName!: string;

  @IsString()
  @MinLength(1)
  contentBase64!: string;
}

export class ClearBooksDto {
  @IsString()
  @IsIn(["CLEAR BOOKS"])
  confirmation!: "CLEAR BOOKS";
}
