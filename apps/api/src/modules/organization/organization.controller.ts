import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import { AccessContext } from "../auth/access";
import { RequirePermissions } from "../auth/decorators";
import { BranchScopeGuard, CurrentBranchScope } from "./branch-scope.guard";
import { BranchScope } from "./branch-scope";
import { BranchesService } from "./branches.service";
import { CompanyService } from "./company.service";
import { DepartmentsService } from "./departments.service";
import { DocumentNumberService } from "./document-number.service";
import { EmployeesService } from "./employees.service";
import { CreateBranchDto, UpdateBranchDto } from "./dto/branch.dto";
import { UpdateCompanyDto } from "./dto/company.dto";
import { CreateDepartmentDto, UpdateDepartmentDto } from "./dto/department.dto";
import { AllocateDocumentNumberDto, ChangeStatusDto } from "./dto/document-number.dto";
import { CreateEmployeeDto, UpdateEmployeeDto } from "./dto/employee.dto";
import { PageQueryDto } from "./dto/page-query.dto";

interface OrgRequest {
  access: AccessContext;
  correlationId?: string;
}

@ApiTags("company")
@Controller("company")
export class CompanyController {
  constructor(private readonly companies: CompanyService) {}

  @Get()
  @RequirePermissions("settings.view")
  get() {
    return this.companies.get();
  }

  @Post()
  @RequirePermissions("settings.manage")
  create(@Body() body: UpdateCompanyDto, @Req() request: OrgRequest) {
    return this.companies.create(body, request.access, request.correlationId);
  }

  @Patch()
  @RequirePermissions("settings.manage")
  update(@Body() body: UpdateCompanyDto, @Req() request: OrgRequest) {
    return this.companies.update(body, request.access, request.correlationId);
  }
}

@ApiTags("branches")
@ApiHeader({ name: "X-Branch-Scope", required: false, description: "Use company for every branch" })
@ApiHeader({ name: "X-Branch-Ids", required: false, description: "Comma-separated branch UUIDs" })
@UseGuards(BranchScopeGuard)
@Controller("branches")
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermissions("branches.view")
  list(@CurrentBranchScope() scope: BranchScope, @Query() query: PageQueryDto) {
    return this.branches.list(scope, query);
  }

  @Get(":id")
  @RequirePermissions("branches.view")
  get(@CurrentBranchScope() scope: BranchScope, @Param("id", ParseUUIDPipe) id: string) {
    return this.branches.get(scope, id);
  }

  @Post()
  @RequirePermissions("branches.manage")
  create(@CurrentBranchScope() scope: BranchScope, @Body() body: CreateBranchDto, @Req() request: OrgRequest) {
    return this.branches.create(scope, body, request.access, request.correlationId);
  }

  @Patch(":id")
  @RequirePermissions("branches.manage")
  update(
    @CurrentBranchScope() scope: BranchScope,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateBranchDto,
    @Req() request: OrgRequest,
  ) {
    return this.branches.update(scope, id, body, request.access, request.correlationId);
  }

  @Patch(":id/status")
  @RequirePermissions("branches.manage")
  changeStatus(
    @CurrentBranchScope() scope: BranchScope,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ChangeStatusDto,
    @Req() request: OrgRequest,
  ) {
    return this.branches.changeStatus(scope, id, body.status, request.access, request.correlationId);
  }
}

@ApiTags("departments")
@UseGuards(BranchScopeGuard)
@Controller("departments")
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Get()
  @RequirePermissions("settings.view")
  list(@CurrentBranchScope() scope: BranchScope, @Query() query: PageQueryDto) {
    return this.departments.list(scope, query);
  }

  @Post()
  @RequirePermissions("settings.manage")
  create(@CurrentBranchScope() scope: BranchScope, @Body() body: CreateDepartmentDto) {
    return this.departments.create(scope, body);
  }

  @Patch(":id")
  @RequirePermissions("settings.manage")
  update(
    @CurrentBranchScope() scope: BranchScope,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateDepartmentDto,
  ) {
    return this.departments.update(scope, id, body);
  }
}

@ApiTags("employees")
@UseGuards(BranchScopeGuard)
@Controller("employees")
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions("settings.view")
  list(@CurrentBranchScope() scope: BranchScope, @Query() query: PageQueryDto) {
    return this.employees.list(scope, query);
  }

  @Get(":id")
  @RequirePermissions("settings.view")
  get(@CurrentBranchScope() scope: BranchScope, @Param("id", ParseUUIDPipe) id: string) {
    return this.employees.get(scope, id);
  }

  @Post()
  @RequirePermissions("settings.manage")
  create(@CurrentBranchScope() scope: BranchScope, @Body() body: CreateEmployeeDto) {
    return this.employees.create(scope, body);
  }

  @Patch(":id")
  @RequirePermissions("settings.manage")
  update(
    @CurrentBranchScope() scope: BranchScope,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: UpdateEmployeeDto,
  ) {
    return this.employees.update(scope, id, body);
  }
}

@ApiTags("document-numbers")
@UseGuards(BranchScopeGuard)
@Controller("document-numbers")
export class DocumentNumbersController {
  constructor(private readonly documentNumbers: DocumentNumberService) {}

  @Post()
  allocate(@CurrentBranchScope() scope: BranchScope, @Body() body: AllocateDocumentNumberDto) {
    return this.documentNumbers.allocate(scope, body.branchId, body.documentType);
  }
}
