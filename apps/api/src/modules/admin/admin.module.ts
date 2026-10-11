import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OrganizationModule } from "../organization/organization.module";
import { AdminController, DocumentsController, NotificationsController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { DocumentsService } from "./documents.service";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [OrganizationModule, AuthModule],
  controllers: [AdminController, NotificationsController, DocumentsController],
  providers: [AdminService, DocumentsService, NotificationsService],
  exports: [AdminService, DocumentsService, NotificationsService],
})
export class AdminModule {}
