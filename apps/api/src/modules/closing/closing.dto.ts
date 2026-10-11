import { IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^\d+(\.\d{1,4})?$/;

export class DailyQueryDto {
  @Matches(DATE)
  date!: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Matches(MONEY)
  countedCash?: string;
}

export class SaveDailyClosingDto {
  @IsUUID()
  branchId!: string;

  @Matches(DATE)
  businessDate!: string;

  @Matches(MONEY)
  countedCash!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  exceptionNotes?: string;
}

export class TaskNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ReopenPeriodDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
