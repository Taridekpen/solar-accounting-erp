import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { PageQueryDto } from "../organization/dto/page-query.dto";
import { CreateExpenseBudgetDto, CreateExpenseDto, CreateExpensePolicyDto, ExpenseReportQueryDto, PayExpenseDto } from "./expenses.dto";
import { ExpensesService } from "./expenses.service";

interface ExpenseRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("expenses")
@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @RequirePermissions("expenses.view")
  @Get()
  list(@Query() query: PageQueryDto, @Req() request: ExpenseRequest) {
    return this.expenses.list(request.access, query);
  }

  @RequirePermissions("expenses.view")
  @Get("categories")
  categories(@Req() request: ExpenseRequest) {
    return this.expenses.categories(request.access);
  }

  @RequirePermissions("expenses.view")
  @Get("reports")
  reports(@Query() query: ExpenseReportQueryDto, @Req() request: ExpenseRequest) {
    return this.expenses.reports(request.access, query);
  }

  @RequirePermissions("expenses.view")
  @Get(":id/receipt")
  async receipt(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: ExpenseRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.expenses.receipt(request.access, id);
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Disposition", `inline; filename="${file.receiptName.replace(/"/g, "")}"`);
    return new StreamableFile(file.content);
  }

  @RequirePermissions("expenses.approve")
  @Post("policies")
  createPolicy(@Body() body: CreateExpensePolicyDto, @Req() request: ExpenseRequest) {
    return this.expenses.createPolicy(request.access, body);
  }

  @RequirePermissions("expenses.approve")
  @Post("budgets")
  createBudget(@Body() body: CreateExpenseBudgetDto, @Req() request: ExpenseRequest) {
    return this.expenses.createBudget(request.access, body);
  }

  @RequirePermissions("expenses.create")
  @Post()
  create(@Body() body: CreateExpenseDto, @Req() request: ExpenseRequest) {
    return this.expenses.create(request.access, body);
  }

  @RequirePermissions("expenses.create")
  @Post(":id/submit")
  submit(@Param("id", ParseUUIDPipe) id: string, @Req() request: ExpenseRequest) {
    return this.expenses.submit(request.access, id, request.correlationId);
  }

  @RequirePermissions("expenses.approve")
  @Post(":id/approve")
  approve(@Param("id", ParseUUIDPipe) id: string, @Req() request: ExpenseRequest) {
    return this.expenses.approve(request.access, id, request.correlationId);
  }

  @RequirePermissions("expenses.approve")
  @Post(":id/reject")
  reject(@Param("id", ParseUUIDPipe) id: string, @Req() request: ExpenseRequest) {
    return this.expenses.reject(request.access, id, request.correlationId);
  }

  @RequirePermissions("expenses.pay")
  @Post(":id/pay")
  pay(@Param("id", ParseUUIDPipe) id: string, @Body() body: PayExpenseDto, @Req() request: ExpenseRequest) {
    return this.expenses.pay(request.access, id, body, request.correlationId);
  }
}
