import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BranchScopeGuard } from "./branch-scope.guard";
import { BranchesService } from "./branches.service";
import { CompanyService } from "./company.service";
import { DepartmentsService } from "./departments.service";
import { DocumentNumberService } from "./document-number.service";
import { EmployeesService } from "./employees.service";
import {
  BranchesController,
  CompanyController,
  DepartmentsController,
  DocumentNumbersController,
  EmployeesController,
} from "./organization.controller";

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [
    CompanyController,
    BranchesController,
    DepartmentsController,
    EmployeesController,
    DocumentNumbersController,
  ],
  providers: [
    CompanyService,
    BranchesService,
    DepartmentsService,
    EmployeesService,
    DocumentNumberService,
    BranchScopeGuard,
  ],
  exports: [CompanyService, DocumentNumberService, BranchesService],
})
export class OrganizationModule {}
