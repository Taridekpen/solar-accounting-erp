import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { CreateCountDto, CreateTransferDto } from "./inventory.dto";
import { InventoryService } from "./inventory.service";

interface InventoryRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("inventory")
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermissions("inventory.view")
  @Get("stock")
  stock(@Query("branchId") branchId: string | undefined, @Req() request: InventoryRequest) {
    return this.inventory.stock(request.access, branchId);
  }

  @RequirePermissions("inventory.view")
  @Get("serials")
  serial(@Query("serial") serial: string, @Req() request: InventoryRequest) {
    return this.inventory.serial(request.access, serial ?? "");
  }

  @RequirePermissions("inventory.view")
  @Get("reports")
  reports(@Req() request: InventoryRequest) {
    return this.inventory.reports(request.access);
  }

  @RequirePermissions("inventory.transfer")
  @Post("transfers")
  createTransfer(@Body() body: CreateTransferDto, @Req() request: InventoryRequest) {
    return this.inventory.createTransfer(request.access, body);
  }

  @RequirePermissions("inventory.transfer")
  @Post("transfers/:id/submit")
  submit(@Param("id", ParseUUIDPipe) id: string, @Req() request: InventoryRequest) {
    return this.inventory.submitTransfer(request.access, id);
  }

  @RequirePermissions("inventory.transfer")
  @Post("transfers/:id/approve")
  approve(@Param("id", ParseUUIDPipe) id: string, @Req() request: InventoryRequest) {
    return this.inventory.approveTransfer(request.access, id);
  }

  @RequirePermissions("inventory.transfer")
  @Post("transfers/:id/ship")
  ship(@Param("id", ParseUUIDPipe) id: string, @Req() request: InventoryRequest) {
    return this.inventory.shipTransfer(request.access, id, request.correlationId);
  }

  @RequirePermissions("inventory.transfer")
  @Post("transfers/:id/receive")
  receive(@Param("id", ParseUUIDPipe) id: string, @Req() request: InventoryRequest) {
    return this.inventory.receiveTransfer(request.access, id, request.correlationId);
  }

  @RequirePermissions("inventory.count")
  @Post("counts")
  createCount(@Body() body: CreateCountDto, @Req() request: InventoryRequest) {
    return this.inventory.createCount(request.access, body);
  }

  @RequirePermissions("inventory.adjust")
  @Post("counts/:id/post")
  postCount(@Param("id", ParseUUIDPipe) id: string, @Req() request: InventoryRequest) {
    return this.inventory.postCount(request.access, id, request.correlationId);
  }
}
