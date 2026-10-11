import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { PageQueryDto } from "../organization/dto/page-query.dto";
import { renderSalesPdf } from "../sales/sales-pdf";
import {
  ApplyDepositDto,
  CreateBillDto,
  CreatePaymentDto,
  CreatePurchaseOrderDto,
  CreateReceiptDto,
  CreateRequisitionDto,
  CreateSupplierDto,
  UpdateSupplierDto,
} from "./procurement.dto";
import { ProcurementService } from "./procurement.service";
import { SuppliersService } from "./suppliers.service";

interface ProcurementRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("procurement")
@Controller()
export class ProcurementController {
  constructor(
    private readonly suppliers: SuppliersService,
    private readonly procurement: ProcurementService,
  ) {}

  @RequirePermissions("suppliers.view")
  @Get("suppliers")
  listSuppliers(@Query() query: PageQueryDto, @Req() request: ProcurementRequest) {
    return this.suppliers.list(request.access, query);
  }

  @RequirePermissions("purchases.create")
  @Post("suppliers")
  createSupplier(@Body() body: CreateSupplierDto, @Req() request: ProcurementRequest) {
    return this.suppliers.create(request.access, body);
  }

  @RequirePermissions("suppliers.view")
  @Get("suppliers/:id/statement")
  statement(@Param("id", ParseUUIDPipe) id: string, @Req() request: ProcurementRequest) {
    return this.suppliers.statement(request.access, id);
  }

  @RequirePermissions("suppliers.view")
  @Get("suppliers/:id")
  getSupplier(@Param("id", ParseUUIDPipe) id: string, @Req() request: ProcurementRequest) {
    return this.suppliers.get(request.access, id);
  }

  @RequirePermissions("purchases.create")
  @Patch("suppliers/:id")
  updateSupplier(@Param("id", ParseUUIDPipe) id: string, @Body() body: UpdateSupplierDto, @Req() request: ProcurementRequest) {
    return this.suppliers.update(request.access, id, body);
  }

  @RequirePermissions("purchases.view")
  @Get("warehouses")
  warehouses(@Query("branchId") branchId: string | undefined, @Req() request: ProcurementRequest) {
    return this.procurement.listWarehouses(request.access, branchId);
  }

  @RequirePermissions("purchases.view")
  @Get("purchases/requisitions")
  requisitions(@Query() query: PageQueryDto, @Req() request: ProcurementRequest) {
    return this.procurement.listRequisitions(request.access, query);
  }

  @RequirePermissions("purchases.create")
  @Post("purchases/requisitions")
  createRequisition(@Body() body: CreateRequisitionDto, @Req() request: ProcurementRequest) {
    return this.procurement.createRequisition(request.access, body);
  }

  @RequirePermissions("purchases.create")
  @Post("purchases/requisitions/:id/submit")
  submitRequisition(@Param("id", ParseUUIDPipe) id: string, @Req() request: ProcurementRequest) {
    return this.procurement.submitRequisition(request.access, id);
  }

  @RequirePermissions("purchases.approve")
  @Post("purchases/requisitions/:id/approve")
  approveRequisition(@Param("id", ParseUUIDPipe) id: string, @Req() request: ProcurementRequest) {
    return this.procurement.approveRequisition(request.access, id);
  }

  @RequirePermissions("purchases.create")
  @Post("purchases/requisitions/:id/convert")
  convertRequisition(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CreatePurchaseOrderDto,
    @Req() request: ProcurementRequest,
  ) {
    return this.procurement.convertRequisition(request.access, id, body);
  }

  @RequirePermissions("purchases.view")
  @Get("purchases/orders")
  orders(@Query() query: PageQueryDto, @Req() request: ProcurementRequest) {
    return this.procurement.listOrders(request.access, query);
  }

  @RequirePermissions("purchases.create")
  @Post("purchases/orders/preview")
  previewOrder(@Body() body: CreatePurchaseOrderDto, @Req() request: ProcurementRequest) {
    return this.procurement.previewOrder(request.access, body);
  }

  @RequirePermissions("purchases.create")
  @Post("purchases/orders")
  createOrder(@Body() body: CreatePurchaseOrderDto, @Req() request: ProcurementRequest) {
    return this.procurement.createOrder(request.access, body);
  }

  @RequirePermissions("purchases.create")
  @Post("purchases/orders/:id/submit")
  submitOrder(@Param("id", ParseUUIDPipe) id: string, @Req() request: ProcurementRequest) {
    return this.procurement.submitOrder(request.access, id);
  }

  @RequirePermissions("purchases.approve")
  @Post("purchases/orders/:id/approve")
  approveOrder(@Param("id", ParseUUIDPipe) id: string, @Req() request: ProcurementRequest) {
    return this.procurement.approveOrder(request.access, id);
  }

  @RequirePermissions("purchases.view")
  @Get("purchases/orders/:id/pdf")
  async orderPdf(@Param("id", ParseUUIDPipe) id: string, @Req() request: ProcurementRequest, @Res() response: Response) {
    const document = await this.procurement.orderPdf(request.access, id);
    const pdf = await renderSalesPdf(document);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${document.number}.pdf"`);
    response.send(pdf);
  }

  @RequirePermissions("purchases.receive")
  @Post("purchases/receipts")
  createReceipt(@Body() body: CreateReceiptDto, @Req() request: ProcurementRequest) {
    return this.procurement.createReceipt(request.access, body, request.correlationId);
  }

  @RequirePermissions("purchases.create")
  @Post("purchases/bills/preview")
  previewBill(@Body() body: CreateBillDto, @Req() request: ProcurementRequest) {
    return this.procurement.previewBill(request.access, body);
  }

  @RequirePermissions("purchases.create")
  @Post("purchases/bills")
  createBill(@Body() body: CreateBillDto, @Req() request: ProcurementRequest) {
    return this.procurement.createBill(request.access, body, request.correlationId);
  }

  @RequirePermissions("purchases.create")
  @Post("purchases/payments")
  createPayment(@Body() body: CreatePaymentDto, @Req() request: ProcurementRequest) {
    return this.procurement.createPayment(request.access, body);
  }

  @RequirePermissions("purchases.approve")
  @Post("purchases/payments/:id/post")
  postPayment(@Param("id", ParseUUIDPipe) id: string, @Req() request: ProcurementRequest) {
    return this.procurement.postPayment(request.access, id, request.correlationId);
  }

  @RequirePermissions("purchases.approve")
  @Post("purchases/payments/:id/apply")
  applyDeposit(@Param("id", ParseUUIDPipe) id: string, @Body() body: ApplyDepositDto, @Req() request: ProcurementRequest) {
    return this.procurement.applyDeposit(request.access, id, body, request.correlationId);
  }

  @RequirePermissions("purchases.view")
  @Get("purchases/reports")
  reports(@Query("from") from: string, @Query("to") to: string, @Req() request: ProcurementRequest) {
    return this.procurement.reports(request.access, from, to);
  }
}
