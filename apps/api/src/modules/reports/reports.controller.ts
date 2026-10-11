import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { renderCsv, renderPdf, renderXlsx, ReportTable } from "./reports-export";
import {
  AsOfDto,
  AssetDateDto,
  CreateFixedAssetDto,
  CreateStatementBudgetDto,
  CreateTaxCodeDto,
  DisposeFixedAssetDto,
  LedgerQueryDto,
  ReportRangeDto,
  TaxPaymentDto,
} from "./reports.dto";
import { ReportsService } from "./reports.service";

interface ReportRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("reports")
@Controller("reports")
@RequirePermissions("reports.view")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("journal")
  journal(@Req() request: ReportRequest, @Query() query: ReportRangeDto, @Res({ passthrough: true }) response: Response) {
    return this.send(response, query.format, "general-journal", this.reports.journal(request.access, query.from, query.to));
  }

  @Get("ledger")
  ledger(@Req() request: ReportRequest, @Query() query: LedgerQueryDto, @Res({ passthrough: true }) response: Response) {
    return this.send(response, query.format, "general-ledger", this.reports.ledger(request.access, query.accountId, query.from, query.to));
  }

  @Get("trial-balance")
  trialBalance(@Req() request: ReportRequest, @Query() query: AsOfDto, @Res({ passthrough: true }) response: Response) {
    return this.send(response, query.format, "trial-balance", this.reports.trialBalance(request.access, query.asOf));
  }

  @Get("profit-and-loss")
  profitAndLoss(@Req() request: ReportRequest, @Query() query: ReportRangeDto, @Res({ passthrough: true }) response: Response) {
    return this.send(response, query.format, "profit-and-loss", this.reports.profitAndLoss(request.access, query.from, query.to, query.mode, query.compareFrom, query.compareTo));
  }

  @Get("balance-sheet")
  balanceSheet(@Req() request: ReportRequest, @Query() query: AsOfDto, @Res({ passthrough: true }) response: Response) {
    return this.send(response, query.format, "balance-sheet", this.reports.balanceSheet(request.access, query.asOf));
  }

  @Get("cash-flow")
  cashFlow(@Req() request: ReportRequest, @Query() query: ReportRangeDto, @Res({ passthrough: true }) response: Response) {
    return this.send(response, query.format, "cash-flow", this.reports.cashFlow(request.access, query.from, query.to));
  }

  @Get("receivables")
  receivables(@Req() request: ReportRequest, @Query() query: AsOfDto, @Res({ passthrough: true }) response: Response) {
    return this.send(response, query.format, "receivables", this.reports.receivables(request.access, query.asOf));
  }

  @Get("payables")
  payables(@Req() request: ReportRequest, @Query() query: AsOfDto, @Res({ passthrough: true }) response: Response) {
    return this.send(response, query.format, "payables", this.reports.payables(request.access, query.asOf));
  }

  @Get("inventory")
  inventory(@Req() request: ReportRequest, @Query() query: ReportRangeDto, @Res({ passthrough: true }) response: Response) {
    return this.send(response, query.format, "inventory-ledger", this.reports.inventory(request.access, query.from, query.to));
  }

  @Get("tax")
  tax(@Req() request: ReportRequest, @Query() query: ReportRangeDto, @Res({ passthrough: true }) response: Response) {
    return this.send(response, query.format, "tax", this.reports.taxReport(request.access, query.from, query.to));
  }

  @Get("tax-codes")
  taxCodes(@Req() request: ReportRequest) {
    return this.reports.taxCodes(request.access);
  }

  @Post("tax-codes")
  createTaxCode(@Req() request: ReportRequest, @Body() body: CreateTaxCodeDto) {
    return this.reports.createTaxCode(request.access, body);
  }

  @Post("tax-payments")
  payTax(@Req() request: ReportRequest, @Body() body: TaxPaymentDto) {
    return this.reports.payTax(request.access, body, request.correlationId);
  }

  @Post("budgets")
  createBudget(@Req() request: ReportRequest, @Body() body: CreateStatementBudgetDto) {
    return this.reports.createBudget(request.access, body);
  }

  @Get("assets")
  assets(@Req() request: ReportRequest) {
    return this.reports.assets(request.access);
  }

  @Post("assets")
  acquire(@Req() request: ReportRequest, @Body() body: CreateFixedAssetDto) {
    return this.reports.acquireAsset(request.access, body, request.correlationId);
  }

  @Post("assets/:id/depreciate")
  depreciate(@Req() request: ReportRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: AssetDateDto) {
    return this.reports.depreciate(request.access, id, body, request.correlationId);
  }

  @Post("assets/:id/dispose")
  dispose(@Req() request: ReportRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: DisposeFixedAssetDto) {
    return this.reports.dispose(request.access, id, body, request.correlationId);
  }

  private async send<T extends { table: ReportTable }>(response: Response, format: string | undefined, filename: string, pending: Promise<T>) {
    const report = await pending;
    if (!format || format === "json") return report;
    if (format === "csv") {
      response.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.csv"` });
      return new StreamableFile(Buffer.from(renderCsv(report.table)));
    }
    if (format === "pdf") {
      response.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}.pdf"` });
      return new StreamableFile(await renderPdf(report.table));
    }
    response.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}.xlsx"` });
    return new StreamableFile(await renderXlsx(report.table));
  }
}
