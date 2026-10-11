import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { BankingService } from "./banking.service";
import {
  BankAdjustmentDto,
  BankStatementLineDto,
  CashBookQueryDto,
  CreateBankAccountDto,
  CreateBankStatementDto,
  CreateCashCountDto,
  CreateCashDrawerDto,
  CreateCashTransferDto,
  ImportStatementDto,
  MatchStatementDto,
} from "./banking.dto";

interface BankingRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("banking")
@Controller("banking")
export class BankingController {
  constructor(private readonly banking: BankingService) {}

  @RequirePermissions("banking.reconcile")
  @Get("accounts")
  accounts(@Req() request: BankingRequest) {
    return this.banking.accounts(request.access);
  }

  @RequirePermissions("banking.transfer")
  @Post("accounts")
  createAccount(@Body() body: CreateBankAccountDto, @Req() request: BankingRequest) {
    return this.banking.createAccount(request.access, body);
  }

  @RequirePermissions("banking.reconcile")
  @Get("drawers")
  drawers(@Req() request: BankingRequest) {
    return this.banking.drawers(request.access);
  }

  @RequirePermissions("banking.transfer")
  @Post("drawers")
  createDrawer(@Body() body: CreateCashDrawerDto, @Req() request: BankingRequest) {
    return this.banking.createDrawer(request.access, body);
  }

  @RequirePermissions("banking.reconcile")
  @Get("cash-book")
  cashBook(@Query() query: CashBookQueryDto, @Req() request: BankingRequest) {
    return this.banking.cashBook(request.access, query);
  }

  @RequirePermissions("banking.transfer")
  @Post("transfers")
  transfer(@Body() body: CreateCashTransferDto, @Req() request: BankingRequest) {
    return this.banking.transfer(request.access, body, request.correlationId);
  }

  @RequirePermissions("banking.transfer")
  @Post("transfers/:id/receive")
  receive(@Param("id", ParseUUIDPipe) id: string, @Req() request: BankingRequest) {
    return this.banking.receive(request.access, id, request.correlationId);
  }

  @RequirePermissions("banking.reconcile")
  @Post("counts")
  createCount(@Body() body: CreateCashCountDto, @Req() request: BankingRequest) {
    return this.banking.createCount(request.access, body);
  }

  @RequirePermissions("banking.reconcile")
  @Post("counts/:id/post")
  postCount(@Param("id", ParseUUIDPipe) id: string, @Req() request: BankingRequest) {
    return this.banking.postCount(request.access, id, request.correlationId);
  }

  @RequirePermissions("banking.reconcile")
  @Get("statements")
  statements(@Req() request: BankingRequest) {
    return this.banking.statements(request.access);
  }

  @RequirePermissions("banking.reconcile")
  @Post("statements")
  createStatement(@Body() body: CreateBankStatementDto, @Req() request: BankingRequest) {
    return this.banking.createStatement(request.access, body);
  }

  @RequirePermissions("banking.reconcile")
  @Get("statements/:id")
  statement(@Param("id", ParseUUIDPipe) id: string, @Req() request: BankingRequest) {
    return this.banking.statement(request.access, id);
  }

  @RequirePermissions("banking.reconcile")
  @Post("statements/:id/lines")
  addLine(@Param("id", ParseUUIDPipe) id: string, @Body() body: BankStatementLineDto, @Req() request: BankingRequest) {
    return this.banking.addLine(request.access, id, body);
  }

  @RequirePermissions("banking.reconcile")
  @Post("statements/:id/import")
  importCsv(@Param("id", ParseUUIDPipe) id: string, @Body() body: ImportStatementDto, @Req() request: BankingRequest) {
    return this.banking.importCsv(request.access, id, body);
  }

  @RequirePermissions("banking.reconcile")
  @Post("statements/:id/match")
  match(@Param("id", ParseUUIDPipe) id: string, @Body() body: MatchStatementDto, @Req() request: BankingRequest) {
    return this.banking.match(request.access, id, body);
  }

  @RequirePermissions("banking.reconcile")
  @Post("statements/:id/adjustments")
  adjust(@Param("id", ParseUUIDPipe) id: string, @Body() body: BankAdjustmentDto, @Req() request: BankingRequest) {
    return this.banking.adjust(request.access, id, body, request.correlationId);
  }

  @RequirePermissions("banking.reconcile")
  @Post("statements/:id/approve")
  approve(@Param("id", ParseUUIDPipe) id: string, @Req() request: BankingRequest) {
    return this.banking.approve(request.access, id, request.correlationId);
  }
}
