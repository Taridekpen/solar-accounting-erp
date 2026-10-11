import { isApiDocsEnabled, validateEnv } from "./env.schema";

describe("validateEnv", () => {
  const valid = {
    NODE_ENV: "test",
    PORT: "3000",
    DATABASE_URL: "postgresql://solar:solar@localhost:5432/solar_accounting",
    REDIS_URL: "redis://localhost:6379",
    WEB_ORIGIN: "http://localhost:5173",
    LOG_LEVEL: "info",
    SESSION_SECRET: "test-session-secret-with-32-characters",
  };

  it("accepts a complete development configuration", () => {
    expect(validateEnv(valid)).toMatchObject({
      NODE_ENV: "test",
      PORT: 3000,
      WEB_ORIGIN: "http://localhost:5173",
    });
  });

  it("rejects a missing database url", () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: "" })).toThrow(/Invalid environment configuration/);
  });

  it("rejects a non-postgres database url", () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: "mysql://localhost/app" })).toThrow(
      /PostgreSQL connection string/,
    );
  });
});

describe("isApiDocsEnabled", () => {
  it("exposes Swagger outside production", () => {
    expect(isApiDocsEnabled("development")).toBe(true);
    expect(isApiDocsEnabled("test")).toBe(true);
    expect(isApiDocsEnabled("production")).toBe(false);
  });
});
