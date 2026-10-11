import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Min, MinLength, ValidateNested } from "class-validator";

const MONEY = /^\d+(\.\d{1,4})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const PROJECT_TYPES = ["residential", "commercial", "industrial", "maintenance", "repairs", "system_upgrade"] as const;
const QUOTATION_CATEGORIES = ["panels", "inverters", "batteries", "mounting", "cables", "accessories", "labor", "transportation", "subcontractors", "other"] as const;
const BUDGET_CATEGORIES = ["equipment", "materials", "labor", "transportation", "subcontractors", "miscellaneous"] as const;

export class ProjectQuotationLineDto {
  @IsIn(QUOTATION_CATEGORIES)
  category!: (typeof QUOTATION_CATEGORIES)[number];

  @IsString()
  @MinLength(2)
  description!: string;

  @Matches(MONEY)
  quantity!: string;

  @Matches(MONEY)
  unitAmount!: string;
}

export class ProjectBudgetLineDto {
  @IsIn(BUDGET_CATEGORIES)
  category!: (typeof BUDGET_CATEGORIES)[number];

  @Matches(MONEY)
  amount!: string;
}

export class CreateProjectDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  branchId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(PROJECT_TYPES)
  projectType!: (typeof PROJECT_TYPES)[number];

  @IsString()
  @MinLength(2)
  location!: string;

  @Matches(MONEY)
  contractValue!: string;

  @Matches(MONEY)
  estimatedCost!: string;

  @Matches(DATE)
  startDate!: string;

  @Matches(DATE)
  expectedCompletionDate!: string;

  @IsOptional()
  @IsIn(["draft", "active"])
  status?: "draft" | "active";

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProjectQuotationLineDto)
  quotation?: ProjectQuotationLineDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ProjectBudgetLineDto)
  budgets?: ProjectBudgetLineDto[];
}

export class CreateProjectDepositDto {
  @IsUUID()
  accountId!: string;

  @Matches(MONEY)
  amount!: string;

  @Matches(DATE)
  depositDate!: string;
}

export class CreateMaterialRequestDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @Matches(MONEY)
  quantity!: string;
}

export class ProjectDateDto {
  @Matches(DATE)
  accountingDate!: string;
}

export class CreateProjectMilestoneDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @Matches(MONEY)
  amount!: string;

  @IsInt()
  @Min(1)
  sequence!: number;
}
