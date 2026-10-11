import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { DailyQueryDto, ReopenPeriodDto, SaveDailyClosingDto, TaskNoteDto } from "./closing.dto";
import { ClosingService } from "./closing.service";

interface ClosingRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("closing")
@Controller("closing")
@RequirePermissions("closing.view")
export class ClosingController {
  constructor(private readonly closing: ClosingService) {}

  @Get("periods")
  periods(@Req() request: ClosingRequest) {
    return this.closing.periods(request.access);
  }

  @Post("periods/:id/start")
  start(@Req() request: ClosingRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.closing.startPeriod(request.access, id);
  }

  @Post("periods/:id/tasks/:code")
  complete(@Req() request: ClosingRequest, @Param("id", ParseUUIDPipe) id: string, @Param("code") code: string, @Body() body: TaskNoteDto) {
    return this.closing.completeTask(request.access, id, code, body);
  }

  @Post("periods/:id/lock")
  lock(@Req() request: ClosingRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.closing.lockPeriod(request.access, id);
  }

  @Post("periods/:id/reopen")
  reopen(@Req() request: ClosingRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: ReopenPeriodDto) {
    return this.closing.reopenPeriod(request.access, id, body);
  }

  @Get("daily")
  daily(@Req() request: ClosingRequest, @Query() query: DailyQueryDto) {
    return this.closing.previewDaily(request.access, query.branchId, query.date, query.countedCash);
  }

  @Post("daily")
  saveDaily(@Req() request: ClosingRequest, @Body() body: SaveDailyClosingDto) {
    return this.closing.saveDaily(request.access, body);
  }

  @Post("daily/:id/review")
  reviewDaily(@Req() request: ClosingRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.closing.reviewDaily(request.access, id);
  }
}
