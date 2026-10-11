import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: "active" | "inactive";
}
