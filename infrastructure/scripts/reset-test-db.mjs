import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const testDatabase = "solar_accounting_test";

function databaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const envPath = resolve(root, ".env");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("DATABASE_URL=")) {
      return trimmed.slice("DATABASE_URL=".length);
    }
  }
  throw new Error("DATABASE_URL is not set");
}

const source = new URL(databaseUrl());
const databaseName = source.pathname.replace(/^\//, "");
if (databaseName !== "solar_accounting") {
  throw new Error(`Reset starts from the development database URL. Refusing to continue from ${databaseName}.`);
}

const admin = new URL(source.toString());
admin.pathname = "/postgres";
const test = new URL(source.toString());
test.pathname = `/${testDatabase}`;

const sql = `
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${testDatabase}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${testDatabase};
CREATE DATABASE ${testDatabase};
`;

const psql = spawnSync(
  "docker",
  ["compose", "exec", "-T", "postgres", "psql", "-U", "solar", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
  { cwd: root, input: sql, encoding: "utf8" },
);
if (psql.status !== 0) {
  process.stderr.write(psql.stderr || psql.stdout);
  process.exit(psql.status ?? 1);
}

const env = { ...process.env, DATABASE_URL: test.toString() };
for (const args of [
  ["exec", "prisma", "migrate", "deploy"],
  ["exec", "prisma", "db", "seed"],
]) {
  const result = spawnSync("pnpm", args, { cwd: resolve(root, "apps/api"), env, encoding: "utf8", shell: true });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.stdout.write(`Reset ${testDatabase}\n`);
