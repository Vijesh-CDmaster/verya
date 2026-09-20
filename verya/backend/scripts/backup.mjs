import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

const databaseUrl = process.env.DATABASE_URL || process.env.neon_db;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to create a Postgres backup.");
  process.exit(1);
}

const outputDir = process.env.BACKUP_DIR || join(process.cwd(), "backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = join(outputDir, `verya-${stamp}.dump`);
await mkdir(outputDir, { recursive: true });

const child = spawn("pg_dump", ["--format=custom", "--file", output, databaseUrl], {
  stdio: ["ignore", "inherit", "inherit"],
  shell: process.platform === "win32",
});

child.on("error", (error) => {
  console.error(`Could not start pg_dump: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code) => {
  if (code === 0) {
    console.log(`Backup written to ${output}`);
  }
  process.exit(code ?? 1);
});
