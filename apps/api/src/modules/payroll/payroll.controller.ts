import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { CreateSalaryPaymentDto, CreateSalarySummaryDto } from "./payroll.dto";
import { PayrollService } from "./payroll.service";

interface PayrollRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("payroll")
@Controller("payroll")
@RequirePermissions("payroll.view")
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get("summaries")
  list(@Req() request: PayrollRequest) {
    return this.payroll.list(request.access);
  }

  @Get("outstanding")
  outstanding(@Req() request: PayrollRequest) {
    return this.payroll.outstanding(request.access);
  }

  @Post("summaries")
  create(@Req() request: PayrollRequest, @Body() body: CreateSalarySummaryDto) {
    return this.payroll.createSummary(request.access, body);
  }

  @Post("summaries/:id/approve")
  approve(@Req() request: PayrollRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.payroll.approveSummary(request.access, id, request.correlationId);
  }

  @Post("payments")
  pay(@Req() request: PayrollRequest, @Body() body: CreateSalaryPaymentDto) {
    return this.payroll.createPayment(request.access, body, request.correlationId);
  }
}
