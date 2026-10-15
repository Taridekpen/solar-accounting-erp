import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators";
import { BranchScope } from "../organization/branch-scope";
import { DashboardDetailQueryDto, DashboardSummaryQueryDto } from "./dashboard-summary.query";
import { DashboardService } from "./dashboard.service";

interface DashboardRequest {
  branchScope?: BranchScope;
}

@ApiTags("dashboard")
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @RequirePermissions("dashboard.view")
  @Get("summary")
  @ApiOkResponse({ description: "Dashboard totals derived from posted ledger activity" })
  getSummary(@Query() query: DashboardSummaryQueryDto, @Req() request: DashboardRequest) {
    return this.dashboardService.getSummary(query, request.branchScope ?? { type: "company" });
  }

  @RequirePermissions("dashboard.view")
  @Get("details")
  @ApiOkResponse({ description: "Journal lines that reconcile to a dashboard figure" })
  getDetails(@Query() query: DashboardDetailQueryDto, @Req() request: DashboardRequest) {
    return this.dashboardService.getDetails(query, request.branchScope ?? { type: "company" });
  }

  @RequirePermissions("dashboard.view")
  @Get("transactions/:id")
  @ApiOkResponse({ description: "Posted journal detail for a recent dashboard transaction" })
  getTransaction(@Param("id", ParseUUIDPipe) id: string, @Req() request: DashboardRequest) {
    return this.dashboardService.getTransaction(id, request.branchScope ?? { type: "company" });
  }
}
