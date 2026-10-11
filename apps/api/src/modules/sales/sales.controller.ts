import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { PageQueryDto } from "../organization/dto/page-query.dto";
import { CustomersService } from "./customers.service";
import {
  ApplyAdvanceDto,
  CreateCustomerDto,
  CreateInvoiceDto,
  CreateQuotationDto,
  CreateReceiptDto,
  CreateReturnDto,
  InspectReturnDto,
  UpdateCustomerDto,
} from "./sales.dto";
import { renderSalesPdf } from "./sales-pdf";
import { SalesService } from "./sales.service";

interface SalesRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("sales")
@Controller()
export class SalesController {
  constructor(
    private readonly customers: CustomersService,
    private readonly sales: SalesService,
  ) {}

  @RequirePermissions("customers.view")
  @Get("customers")
  listCustomers(@Query() query: PageQueryDto, @Req() request: SalesRequest) {
    return this.customers.list(request.access, query);
  }

  @RequirePermissions("sales.create")
  @Post("customers")
  createCustomer(@Body() body: CreateCustomerDto, @Req() request: SalesRequest) {
    return this.customers.create(request.access, body);
  }

  @RequirePermissions("customers.view")
  @Get("customers/:id/statement")
  statement(@Param("id", ParseUUIDPipe) id: string, @Req() request: SalesRequest) {
    return this.customers.statement(request.access, id);
  }

  @RequirePermissions("customers.view")
  @Get("customers/:id")
  getCustomer(@Param("id", ParseUUIDPipe) id: string, @Req() request: SalesRequest) {
    return this.customers.get(request.access, id);
  }

  @RequirePermissions("sales.create")
  @Patch("customers/:id")
  updateCustomer(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateCustomerDto, @Req() request: SalesRequest) {
    return this.customers.update(request.access, id, body);
  }

  @RequirePermissions("sales.view")
  @Get("products")
  products(@Query("branchId") branchId: string | undefined, @Req() request: SalesRequest) {
    return this.sales.products(request.access, branchId);
  }

  @RequirePermissions("sales.view")
  @Get("sales/quotations")
  quotations(@Query() query: PageQueryDto, @Req() request: SalesRequest) {
    return this.sales.listQuotations(request.access, query);
  }

  @RequirePermissions("sales.create")
  @Post("sales/quotations")
  createQuotation(@Body() body: CreateQuotationDto, @Req() request: SalesRequest) {
    return this.sales.createQuotation(request.access, body);
  }

  @RequirePermissions("sales.create")
  @Post("sales/quotations/:id/submit")
  submitQuotation(@Param("id", ParseUUIDPipe) id: string, @Req() request: SalesRequest) {
    return this.sales.submitQuotation(request.access, id);
  }

  @RequirePermissions("sales.approve")
  @Post("sales/quotations/:id/approve")
  approveQuotation(@Param("id", ParseUUIDPipe) id: string, @Req() request: SalesRequest) {
    return this.sales.approveQuotation(request.access, id);
  }

  @RequirePermissions("sales.create")
  @Post("sales/quotations/:id/convert")
  convertQuotation(@Param("id", ParseUUIDPipe) id: string, @Req() request: SalesRequest) {
    return this.sales.convertQuotation(request.access, id);
  }

  @RequirePermissions("sales.view")
  @Get("sales/quotations/:id/pdf")
  async quotationPdf(@Param("id", ParseUUIDPipe) id: string, @Req() request: SalesRequest, @Res() response: Response) {
    await this.sendPdf(response, await this.sales.quotationPdf(request.access, id));
  }

  @RequirePermissions("sales.create")
  @Post("sales/invoices/preview")
  preview(@Body() body: CreateInvoiceDto, @Req() request: SalesRequest) {
    return this.sales.preview(request.access, body);
  }

  @RequirePermissions("sales.view")
  @Get("sales/invoices")
  invoices(@Query() query: PageQueryDto, @Req() request: SalesRequest) {
    return this.sales.listInvoices(request.access, query);
  }

  @RequirePermissions("sales.create")
  @Post("sales/invoices")
  createInvoice(@Body() body: CreateInvoiceDto, @Req() request: SalesRequest) {
    return this.sales.createInvoice(request.access, body);
  }

  @RequirePermissions("sales.create")
  @Patch("sales/invoices/:id")
  updateInvoice(@Param("id", ParseUUIDPipe) id: string, @Body() body: CreateInvoiceDto, @Req() request: SalesRequest) {
    return this.sales.updateInvoice(request.access, id, body);
  }

  @RequirePermissions("sales.create")
  @Post("sales/invoices/:id/cancel")
  cancelInvoice(@Param("id", ParseUUIDPipe) id: string, @Req() request: SalesRequest) {
    return this.sales.cancelInvoice(request.access, id);
  }

  @RequirePermissions("sales.create")
  @Post("sales/invoices/:id/finalize")
  finalizeInvoice(@Param("id", ParseUUIDPipe) id: string, @Req() request: SalesRequest) {
    return this.sales.finalizeInvoice(request.access, id, request.correlationId);
  }

  @RequirePermissions("sales.view")
  @Get("sales/invoices/:id/pdf")
  async invoicePdf(@Param("id", ParseUUIDPipe) id: string, @Req() request: SalesRequest, @Res() response: Response) {
    await this.sendPdf(response, await this.sales.invoicePdf(request.access, id));
  }

  @RequirePermissions("sales.view")
  @Get("sales/receipts")
  receipts(@Query() query: PageQueryDto, @Req() request: SalesRequest) {
    return this.sales.listReceipts(request.access, query);
  }

  @RequirePermissions("sales.create")
  @Post("sales/receipts")
  createReceipt(@Body() body: CreateReceiptDto, @Req() request: SalesRequest) {
    return this.sales.createReceipt(request.access, body, request.correlationId);
  }

  @RequirePermissions("sales.create")
  @Post("sales/receipts/:id/apply")
  applyAdvance(@Param("id", ParseUUIDPipe) id: string, @Body() body: ApplyAdvanceDto, @Req() request: SalesRequest) {
    return this.sales.applyAdvance(request.access, id, body, request.correlationId);
  }

  @RequirePermissions("sales.view")
  @Get("sales/returns")
  returns(@Query() query: PageQueryDto, @Req() request: SalesRequest) {
    return this.sales.listReturns(request.access, query);
  }

  @RequirePermissions("sales.create")
  @Post("sales/returns")
  createReturn(@Body() body: CreateReturnDto, @Req() request: SalesRequest) {
    return this.sales.createReturn(request.access, body);
  }

  @RequirePermissions("sales.approve")
  @Post("sales/returns/:id/approve")
  approveReturn(@Param("id", ParseUUIDPipe) id: string, @Req() request: SalesRequest) {
    return this.sales.approveReturn(request.access, id);
  }

  @RequirePermissions("inventory.view")
  @Post("sales/returns/:id/inspect")
  inspectReturn(@Param("id", ParseUUIDPipe) id: string, @Body() body: InspectReturnDto, @Req() request: SalesRequest) {
    return this.sales.inspectReturn(request.access, id, body);
  }

  @RequirePermissions("sales.reverse")
  @Post("sales/returns/:id/post")
  postReturn(@Param("id", ParseUUIDPipe) id: string, @Req() request: SalesRequest) {
    return this.sales.postReturn(request.access, id, request.correlationId);
  }

  private async sendPdf(response: Response, document: Parameters<typeof renderSalesPdf>[0]) {
    const pdf = await renderSalesPdf(document);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${document.number}.pdf"`);
    response.send(pdf);
  }
}
