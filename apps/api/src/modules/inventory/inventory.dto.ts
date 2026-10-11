import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, Matches, ValidateNested } from "class-validator";

const MONEY = /^\d+(\.\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class TransferLineDto {
  @IsUUID()
  productId!: string;

  @Matches(MONEY)
  quantity!: string;
}

export class CreateTransferDto {
  @IsUUID()
  sourceBranchId!: string;

  @IsUUID()
  destinationBranchId!: string;

  @IsUUID()
  sourceWarehouseId!: string;

  @IsUUID()
  destinationWarehouseId!: string;

  @Matches(DATE)
  transferDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}

export class CountLineDto {
  @IsUUID()
  productId!: string;

  @Matches(MONEY)
  countedQuantity!: string;
}

export class CreateCountDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  warehouseId!: string;

  @Matches(DATE)
  countDate!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  lines!: CountLineDto[];
}

export class SerialQueryDto {
  @IsOptional()
  @IsString()
  serial?: string;
}
