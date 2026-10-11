import { IsBoolean, IsEmail, IsIn, IsInt, IsNumberString, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradingName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxIdentificationNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  baseCurrency?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsNumberString()
  purchaseApprovalLimit?: string;

  @IsOptional()
  @IsIn(["weighted_average"])
  inventoryCostingMethod?: "weighted_average";

  @IsOptional()
  @IsIn(["half_up"])
  moneyRoundingMode?: "half_up";

  @IsOptional()
  @IsBoolean()
  emailNotificationsEnabled?: boolean;
}
