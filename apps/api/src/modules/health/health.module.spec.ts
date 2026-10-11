import { Test } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { HealthModule } from "./health.module";
import { HealthService } from "./health.service";

describe("HealthModule", () => {
  it("is a Nest module", () => {
    expect(HealthModule).toBeDefined();
    expect(Reflect.getMetadata("controllers", HealthModule)).toEqual([HealthController]);
  });

  it("returns the service report from the controller", async () => {
    const report = {
      status: "ok" as const,
      checks: { database: "up" as const, redis: "up" as const, queue: "up" as const },
      queue: { waiting: 0, active: 0, delayed: 0, failed: 0 },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: { check: jest.fn().mockResolvedValue(report) },
        },
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    await expect(controller.check()).resolves.toEqual(report);
  });
});
