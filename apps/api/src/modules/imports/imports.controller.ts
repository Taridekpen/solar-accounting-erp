import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { UploadImportDto } from "./imports.dto";
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
