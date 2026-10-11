import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { PrismaService } from "../../database/prisma.service";
import { REDIS } from "../../database/redis.module";
import { SYSTEM_QUEUE } from "../../jobs/jobs.module";

export interface HealthReport {
  status: "ok";
  checks: {
    database: "up";
    redis: "up";
    queue: "up";
  };
  queue: {
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    @InjectQueue(SYSTEM_QUEUE) private readonly queue: Queue,
  ) {}

  async check(): Promise<HealthReport> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      if (this.redis.status === "wait" || this.redis.status === "end") {
        await this.redis.connect();
      }
      const pong = await this.redis.ping();
      if (pong !== "PONG") {
        throw new Error("Redis did not respond");
      }
      const counts = await this.queue.getJobCounts("waiting", "active", "delayed", "failed");
      return {
        status: "ok",
        checks: {
          database: "up",
          redis: "up",
          queue: "up",
        },
        queue: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
        },
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown failure";
      throw new ServiceUnavailableException(`Dependency check failed: ${reason}`);
    }
  }
}
