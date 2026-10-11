import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators";
import { HealthService } from "./health.service";

@ApiTags("health")
@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ description: "Database, Redis, and queue connections are available" })
  check() {
    return this.healthService.check();
  }
}
