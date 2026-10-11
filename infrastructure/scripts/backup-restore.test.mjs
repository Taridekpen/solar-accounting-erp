import { execFileSync, execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(index + 1).trim();
  }
}

loadEnv();

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const dbName = "solar_backup_restore_test";
const throwawayUrl = sourceUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`);
if (throwawayUrl === sourceUrl) {
  console.error("Could not derive throwaway database URL");
  process.exit(1);
}

function hasBinary(name) {
  try {
    execSync(process.platform === "win32" ? `where ${name}` : `command -v ${name}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function dockerPostgres() {
  try {
    const ids = execFileSync("docker", ["compose", "ps", "-q", "postgres"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    return ids.split(/\s+/).filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}

function runLocal() {
  const adminUrl = sourceUrl.replace(/\/[^/?]+(\?|$)/, "/postgres$1");
  try {
    execFileSync("psql", [adminUrl, "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${dbName};`], {
      stdio: "inherit",
    });
  } catch {
    // ignore
  }
  execFileSync("psql", [adminUrl, "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbName};`], { stdio: "inherit" });
  const dir = mkdtempSync(join(tmpdir(), "solar-backup-"));
  const dumpPath = join(dir, "dump.sql");
  execFileSync("pg_dump", ["--no-owner", "--format=plain", "--file", dumpPath, sourceUrl], { stdio: "inherit" });
  execFileSync("psql", [throwawayUrl, "-v", "ON_ERROR_STOP=1", "-f", dumpPath], { stdio: "inherit" });
  const check = execFileSync(
    "psql",
    [throwawayUrl, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", "SELECT 1; SELECT schema_version FROM system_metadata LIMIT 1;"],
    { encoding: "utf8" },
  );
  writeFileSync(join(dir, "ok.txt"), check);
  rmSync(dir, { recursive: true, force: true });
  return check;
}

function runDocker(containerId) {
  const exec = (args, encoding) =>
    execFileSync("docker", ["exec", "-e", "PGPASSWORD=solar", containerId, ...args], {
      encoding: encoding ?? "utf8",
      stdio: encoding ? undefined : "inherit",
    });
  try {
    exec(["psql", "-U", "solar", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${dbName};`]);
  } catch {
    // ignore
  }
  exec(["psql", "-U", "solar", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${dbName};`]);
  const dump = execFileSync(
    "docker",
    ["exec", "-e", "PGPASSWORD=solar", containerId, "pg_dump", "-U", "solar", "--no-owner", "--format=plain", "solar_accounting"],
    { encoding: "utf8" },
  );
  const dir = mkdtempSync(join(tmpdir(), "solar-backup-"));
  const dumpPath = join(dir, "dump.sql");
  writeFileSync(dumpPath, dump);
  execFileSync("docker", ["cp", dumpPath, `${containerId}:/tmp/solar-dump.sql`], { stdio: "inherit" });
  exec(["psql", "-U", "solar", "-d", dbName, "-v", "ON_ERROR_STOP=1", "-f", "/tmp/solar-dump.sql"]);
  const check = exec(
    ["psql", "-U", "solar", "-d", dbName, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", "SELECT 1; SELECT schema_version FROM system_metadata LIMIT 1;"],
    "utf8",
  );
  try {
    exec(["psql", "-U", "solar", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${dbName};`]);
  } catch {
    // best effort
  }
  rmSync(dir, { recursive: true, force: true });
  return check;
}

let check;
if (hasBinary("pg_dump") && hasBinary("psql")) {
  check = runLocal();
} else {
  const containerId = dockerPostgres();
  if (!containerId) {
    console.error("Neither local pg_dump/psql nor a running compose postgres service was found");
    process.exit(1);
  }
  check = runDocker(containerId);
}

if (!check.includes("1") || !/\d+/.test(check)) {
  console.error(`Restore verification failed: ${check}`);
  process.exit(1);
}
console.log("backup-restore ok");
console.log(check.trim());
