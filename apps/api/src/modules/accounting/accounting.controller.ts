import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { AccountsService } from "./accounts.service";
import {
  CreateAccountDto,
  ManualJournalDto,
  OpeningBalanceDto,
  PostEventDto,
  ReverseJournalDto,
  UpdateAccountDto,
} from "./dto";
import { AccountingPostingService } from "./posting.service";

interface AccountingRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("accounting")
@Controller()
export class AccountingController {
  constructor(
    private readonly posting: AccountingPostingService,
    private readonly accounts: AccountsService,
  ) {}

  @RequirePermissions("accounts.view")
  @Get("accounts")
  listAccounts(@Req() request: AccountingRequest) {
    return this.accounts.list(request.access);
  }

  @RequirePermissions("settings.manage")
  @Post("accounts")
  createAccount(@Body() body: CreateAccountDto, @Req() request: AccountingRequest) {
    return this.accounts.create(request.access, body);
  }

  @RequirePermissions("settings.manage")
  @Patch("accounts/:id")
  updateAccount(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateAccountDto,
    @Req() request: AccountingRequest,
  ) {
    return this.accounts.update(request.access, id, body);
  }

  @RequirePermissions("accounting.journal.view")
  @Get("journals")
  listJournals(@Req() request: AccountingRequest) {
    return this.posting.listJournals(request.access);
  }

  @RequirePermissions("accounting.journal.view")
  @Get("journals/:id")
  getJournal(@Param("id", ParseUUIDPipe) id: string, @Req() request: AccountingRequest) {
    return this.posting.getJournal(request.access, id);
  }

  @RequirePermissions("accounting.journal.create")
  @Post("journals")
  createJournal(@Body() body: ManualJournalDto, @Req() request: AccountingRequest) {
    return this.posting.createManual(request.access, body, request.correlationId);
  }

  @RequirePermissions("accounting.journal.approve")
  @Post("journals/:id/approve")
  approve(@Param("id", ParseUUIDPipe) id: string, @Req() request: AccountingRequest) {
    return this.posting.approve(request.access, id, request.correlationId);
  }

  @RequirePermissions("accounting.journal.create")
  @Post("journals/:id/reverse")
  reverse(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ReverseJournalDto,
    @Req() request: AccountingRequest,
  ) {
    return this.posting.reverse(request.access, id, body.reason, request.correlationId);
  }

  @RequirePermissions("accounting.journal.create")
  @Post("accounting/post")
  postEvent(@Body() body: PostEventDto, @Req() request: AccountingRequest) {
    return this.posting.postEvent(request.access, body, request.correlationId);
  }

  @RequirePermissions("accounting.journal.view")
  @Get("accounting/review")
  review(@Req() request: AccountingRequest) {
    return this.posting.review(request.access);
  }

  @RequirePermissions("accounting.journal.view")
  @Get("accounting/trial-balance")
  trialBalance(@Req() request: AccountingRequest) {
    return this.posting.trialBalance(request.access);
  }

  @RequirePermissions("accounting.journal.view")
  @Get("fiscal-periods")
  periods(@Req() request: AccountingRequest) {
    return this.posting.listPeriods(request.access);
  }

  @RequirePermissions("accounting.period.close")
  @Post("fiscal-periods/:id/close")
  closePeriod(@Param("id", ParseUUIDPipe) id: string, @Req() request: AccountingRequest) {
    return this.posting.closePeriod(request.access, id, request.correlationId);
  }

  @RequirePermissions("accounting.journal.create")
  @Post("opening-balances")
  openingBalances(@Body() body: OpeningBalanceDto, @Req() request: AccountingRequest) {
    return this.posting.importOpeningBalances(request.access, body, request.correlationId);
  }
}
