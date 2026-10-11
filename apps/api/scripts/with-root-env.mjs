import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), "../../.env");
const env = { ...process.env };

for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    continue;
  }
  const separator = trimmed.indexOf("=");
  if (separator === -1) {
    continue;
  }
  const key = trimmed.slice(0, separator);
  const value = trimmed.slice(separator + 1);
  if (!env[key]) {
    env[key] = value;
  }
}

const [command, ...args] = process.argv.slice(2);
const child = spawn(command, args, { env, stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 1));
