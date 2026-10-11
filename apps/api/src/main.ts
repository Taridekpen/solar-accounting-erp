import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { AppEnv, isApiDocsEnabled } from "./config/env.schema";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<AppEnv, true>);
  const nodeEnv = config.get("NODE_ENV", { infer: true });
  const webOrigin = config.get("WEB_ORIGIN", { infer: true });

  app.useLogger(app.get(Logger));
  app.enableCors({
    origin: webOrigin,
    credentials: true,
    allowedHeaders: ["Content-Type", "X-Branch-Ids", "X-CSRF-Token", "X-Request-Id"],
  });
  app.use((request: Request & { correlationId?: string }, _response: Response, next: NextFunction) => {
    request.correlationId = request.header("x-request-id") || randomUUID();
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  if (isApiDocsEnabled(nodeEnv)) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Solar & Inverter Accounting API")
        .setDescription("Foundation API for the solar and inverter accounting system.")
        .setVersion("0.1.0")
        .build(),
    );
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = config.get("PORT", { infer: true });
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
