import { IsArray, IsDateString, IsEmail, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class EmailDto {
  @IsEmail()
  email!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsString()
  totp?: string;
}

export class PasswordDto {
  @IsString()
  @MinLength(12)
  password!: string;
}

export class ResetPasswordDto extends PasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  newPassword!: string;
}

export class TotpDto {
  @IsString()
  @MinLength(6)
  code!: string;
}

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsArray()
  @IsString({ each: true })
  roleCodes!: string[];

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  branchIds?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  branchIds?: string[];
}

export class AuthorizeApprovalDto {
  @IsString()
  permission!: string;

  @IsUUID()
  originatorUserId!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class DelegationDto {
  @IsUUID()
  delegateUserId!: string;

  @IsString()
  permissionCode!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}
