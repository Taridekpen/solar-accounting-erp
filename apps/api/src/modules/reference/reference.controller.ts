import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators";
import { PrismaService } from "../../database/prisma.service";

@ApiTags("reference")
@Controller()
export class ReferenceController {
  constructor(private readonly prisma: PrismaService) {}

  @RequirePermissions("users.view")
  @Get("roles")
  async roles() {
    const rows = await this.prisma.role.findMany({
      orderBy: { name: "asc" },
      include: { permissions: { include: { permission: true } } },
    });
    return rows.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      permissions: role.permissions.map((item) => item.permission.code).sort(),
    }));
  }

  @RequirePermissions("users.view")
  @Get("permissions")
  permissions() {
    return this.prisma.permission.findMany({ orderBy: { code: "asc" } });
  }
}
