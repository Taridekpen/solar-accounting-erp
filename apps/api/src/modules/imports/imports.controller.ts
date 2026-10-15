import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { ClearBooksDto, UploadImportDto } from "./imports.dto";
import { ImportsService } from "./imports.service";

interface ImportsRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("imports")
@Controller("imports")
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @RequirePermissions("imports.view")
  @Get()
  list(@Req() request: ImportsRequest) {
    return this.imports.list(request.access);
  }

  @RequirePermissions("imports.manage")
  @Get("mock-files")
  listMockFiles(@Req() request: ImportsRequest) {
    return this.imports.listMockFiles(request.access);
  }

  @RequirePermissions("imports.manage")
  @Get("mock-files/:type")
  async mockFile(
    @Req() request: ImportsRequest,
    @Param("type") type: string,
    @Res({ passthrough: false }) response: Response,
  ) {
    const file = await this.imports.mockFile(request.access, type);
    response.setHeader("Content-Type", file.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    response.send(file.content);
  }

  @RequirePermissions("imports.manage")
  @Post("clear-books")
  clearBooks(@Req() request: ImportsRequest, @Body() body: ClearBooksDto) {
    return this.imports.clearBooks(request.access, body, request.correlationId);
  }

  @RequirePermissions("imports.manage")
  @Post()
  upload(@Req() request: ImportsRequest, @Body() body: UploadImportDto) {
    return this.imports.upload(request.access, body);
  }

  @RequirePermissions("imports.manage")
  @Post(":id/parse")
  parse(@Req() request: ImportsRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.imports.parse(request.access, id);
  }

  @RequirePermissions("imports.manage")
  @Post(":id/validate")
  validate(@Req() request: ImportsRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.imports.validate(request.access, id);
  }

  @RequirePermissions("imports.view")
  @Get(":id/preview")
  preview(@Req() request: ImportsRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.imports.preview(request.access, id);
  }

  @RequirePermissions("imports.manage")
  @Post(":id/approve")
  approve(@Req() request: ImportsRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.imports.approve(request.access, id, request.correlationId);
  }

  @RequirePermissions("imports.manage")
  @Post(":id/commit")
  commit(@Req() request: ImportsRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.imports.commit(request.access, id, request.correlationId);
  }

  @RequirePermissions("imports.view")
  @Get(":id/report")
  report(@Req() request: ImportsRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.imports.report(request.access, id);
  }
}
