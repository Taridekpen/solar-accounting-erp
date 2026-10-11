import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import {
  CreateAdminExpensePolicyDto,
  CreateAdminTaxCodeDto,
  CreateSeparationRuleDto,
  DocumentListQueryDto,
  UpdateAccountMappingDto,
  UpdateDocumentTemplatesDto,
  UploadDocumentDto,
} from "./admin.dto";
import { AdminService } from "./admin.service";
import { DocumentsService } from "./documents.service";
import { NotificationsService } from "./notifications.service";

interface AdminRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("admin")
@Controller("admin")
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly documents: DocumentsService,
    private readonly notifications: NotificationsService,
  ) {}

  @RequirePermissions("settings.view")
  @Get("document-templates")
  templates(@Req() request: AdminRequest) {
    return this.admin.getDocumentTemplates(request.access);
  }

  @RequirePermissions("settings.manage")
  @Patch("document-templates")
  updateTemplates(@Req() request: AdminRequest, @Body() body: UpdateDocumentTemplatesDto) {
    return this.admin.updateDocumentTemplates(request.access, body, request.correlationId);
  }

  @RequirePermissions("settings.view")
  @Get("account-mappings")
  mappings(@Req() request: AdminRequest) {
    return this.admin.listAccountMappings(request.access);
  }

  @RequirePermissions("settings.manage")
  @Patch("account-mappings")
  updateMapping(@Req() request: AdminRequest, @Body() body: UpdateAccountMappingDto) {
    return this.admin.updateAccountMapping(request.access, body, request.correlationId);
  }

  @RequirePermissions("settings.view")
  @Get("tax-codes")
  taxCodes(@Req() request: AdminRequest) {
    return this.admin.listTaxCodes(request.access);
  }

  @RequirePermissions("settings.manage")
  @Post("tax-codes")
  createTaxCode(@Req() request: AdminRequest, @Body() body: CreateAdminTaxCodeDto) {
    return this.admin.createTaxCode(request.access, body, request.correlationId);
  }

  @RequirePermissions("settings.view")
  @Get("fiscal-periods")
  fiscalPeriods(@Req() request: AdminRequest) {
    return this.admin.listFiscalPeriods(request.access);
  }

  @RequirePermissions("settings.view")
  @Get("expense-policies")
  expensePolicies(@Req() request: AdminRequest) {
    return this.admin.listExpensePolicies(request.access);
  }

  @RequirePermissions("settings.manage")
  @Post("expense-policies")
  createExpensePolicy(@Req() request: AdminRequest, @Body() body: CreateAdminExpensePolicyDto) {
    return this.admin.createExpensePolicy(request.access, body, request.correlationId);
  }

  @RequirePermissions("settings.view")
  @Get("approval-delegations")
  delegations(@Req() request: AdminRequest) {
    return this.admin.listDelegations(request.access);
  }

  @RequirePermissions("settings.manage")
  @Delete("approval-delegations/:id")
  revokeDelegation(@Req() request: AdminRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.admin.revokeDelegation(request.access, id, request.correlationId);
  }

  @RequirePermissions("settings.view")
  @Get("separation-rules")
  separationRules(@Req() request: AdminRequest) {
    return this.admin.listSeparationRules(request.access);
  }

  @RequirePermissions("settings.manage")
  @Post("separation-rules")
  addSeparationRule(@Req() request: AdminRequest, @Body() body: CreateSeparationRuleDto) {
    return this.admin.addSeparationRule(request.access, body, request.correlationId);
  }

  @RequirePermissions("settings.manage")
  @Delete("separation-rules/:id")
  removeSeparationRule(@Req() request: AdminRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.admin.removeSeparationRule(request.access, id, request.correlationId);
  }

  @RequirePermissions("branches.view")
  @Get("branches/:id/settings")
  branchSettings(@Req() request: AdminRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.admin.branchSettings(request.access, id);
  }
}

@ApiTags("notifications")
@Controller("notifications")
@RequirePermissions("notifications.view")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() request: AdminRequest) {
    return this.notifications.list(request.access);
  }

  @Get("unread-count")
  unread(@Req() request: AdminRequest) {
    return this.notifications.unreadCount(request.access).then((count) => ({ count }));
  }

  @Post("refresh")
  refresh(@Req() request: AdminRequest) {
    return this.notifications.refresh(request.access);
  }

  @Post("read-all")
  readAll(@Req() request: AdminRequest) {
    return this.notifications.markAllRead(request.access);
  }

  @Post(":id/read")
  read(@Req() request: AdminRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.markRead(request.access, id);
  }
}

@ApiTags("documents")
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @RequirePermissions("documents.view")
  @Get()
  list(@Req() request: AdminRequest, @Query() query: DocumentListQueryDto) {
    return this.documents.list(request.access, query);
  }

  @RequirePermissions("documents.manage")
  @Post()
  upload(@Req() request: AdminRequest, @Body() body: UploadDocumentDto) {
    return this.documents.upload(request.access, body, request.correlationId);
  }

  @RequirePermissions("documents.view")
  @Get(":id/content")
  async content(
    @Req() request: AdminRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.documents.content(request.access, id);
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Disposition", `inline; filename="${file.fileName.replace(/"/g, "")}"`);
    return new StreamableFile(file.content);
  }
}
