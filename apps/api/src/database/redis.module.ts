import { Global, Inject, Injectable, Module, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { AppEnv } from "../config/env.schema";

export const REDIS = Symbol("REDIS");

@Injectable()
export class RedisLifecycle implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== "end") {
      await this.redis.quit();
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppEnv, true>) =>
        new Redis(config.get("REDIS_URL", { infer: true }), {
          maxRetriesPerRequest: 1,
          lazyConnect: true,
          enableReadyCheck: true,
        }),
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}
