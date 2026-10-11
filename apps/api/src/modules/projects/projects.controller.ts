import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { CreateMaterialRequestDto, CreateProjectDepositDto, CreateProjectDto, CreateProjectMilestoneDto, ProjectDateDto } from "./projects.dto";
import { ProjectsService } from "./projects.service";

interface ProjectRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("projects")
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @RequirePermissions("projects.view")
  @Get()
  list(@Req() request: ProjectRequest) {
    return this.projects.list(request.access);
  }

  @RequirePermissions("projects.create")
  @Post()
  create(@Req() request: ProjectRequest, @Body() body: CreateProjectDto) {
    return this.projects.create(request.access, body);
  }

  @RequirePermissions("projects.view")
  @Get(":id")
  get(@Req() request: ProjectRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.projects.get(request.access, id);
  }

  @RequirePermissions("projects.create")
  @Post(":id/deposits")
  deposit(@Req() request: ProjectRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: CreateProjectDepositDto) {
    return this.projects.deposit(request.access, id, body, request.correlationId);
  }

  @RequirePermissions("projects.issue")
  @Post(":id/materials")
  reserve(@Req() request: ProjectRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: CreateMaterialRequestDto) {
    return this.projects.reserve(request.access, id, body);
  }

  @RequirePermissions("projects.approve")
  @Post(":id/materials/:requestId/approve")
  approveMaterial(
    @Req() request: ProjectRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("requestId", ParseUUIDPipe) requestId: string,
  ) {
    return this.projects.approveMaterial(request.access, id, requestId, request.correlationId);
  }

  @RequirePermissions("projects.issue")
  @Post(":id/materials/:requestId/issue")
  issue(
    @Req() request: ProjectRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("requestId", ParseUUIDPipe) requestId: string,
    @Body() body: ProjectDateDto,
  ) {
    return this.projects.issue(request.access, id, requestId, body, request.correlationId);
  }

  @RequirePermissions("projects.issue")
  @Post(":id/materials/:requestId/return")
  returnMaterial(
    @Req() request: ProjectRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("requestId", ParseUUIDPipe) requestId: string,
    @Body() body: ProjectDateDto,
  ) {
    return this.projects.returnMaterial(request.access, id, requestId, body, request.correlationId);
  }

  @RequirePermissions("projects.create")
  @Post(":id/milestones")
  addMilestone(@Req() request: ProjectRequest, @Param("id", ParseUUIDPipe) id: string, @Body() body: CreateProjectMilestoneDto) {
    return this.projects.addMilestone(request.access, id, body);
  }

  @RequirePermissions("projects.approve")
  @Post(":id/milestones/:milestoneId/recognize")
  recognize(
    @Req() request: ProjectRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("milestoneId", ParseUUIDPipe) milestoneId: string,
    @Body() body: ProjectDateDto,
  ) {
    return this.projects.recognize(request.access, id, milestoneId, body, request.correlationId);
  }
}
