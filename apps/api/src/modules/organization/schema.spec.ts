import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("organization schema", () => {
  const schema = readFileSync(resolve(__dirname, "../../../prisma/schema.prisma"), "utf8");
  const migration = readFileSync(
    resolve(__dirname, "../../../prisma/migrations/20261009213000_organization/migration.sql"),
    "utf8",
  );

  it("stores organization data without floating-point amounts", () => {
    expect(schema).not.toMatch(/\b(Float|Double)\b/);
    expect(migration.toLowerCase()).not.toMatch(/\b(float|double precision|numeric|decimal)\b/);
    const account = schema.slice(schema.indexOf("model Account {"), schema.indexOf("model User {"));
    expect(account).not.toMatch(/\b(Float|Decimal|Double)\b/);
    expect(schema).not.toMatch(/^\s+balance\b/m);
  });
});
