/**
 * Launch the Houston desktop app against the TypeScript engine.
 *
 * Why this exists: `pnpm tauri dev` resolves the engine binary as
 * `HOUSTON_ENGINE_BIN` -> `target/debug/houston-engine` (Rust) -> staged
 * sidecar. If the env var doesn't reach the Tauri-spawned process you SILENTLY
 * get the Rust engine. This script (1) rebuilds the TS engine exe, (2) sets
 * `HOUSTON_ENGINE_BIN` to it in the child env (so it always wins), and (3)
 * launches `tauri dev`. Run via `pnpm dev:ts-engine`.
 *
 * The Rust supervisor prints a loud "HOUSTON ENGINE" banner on boot (binary
 * path + version + port) so you can always confirm which engine you got
 * (TS engine version = 0.1.x; Rust engine = crate version e.g. 0.4.15).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const isWin = process.platform === "win32";
const exeName = isWin ? "houston-engine.exe" : "houston-engine";
const exe = join(repo, "packages", "engine", "server", "dist", exeName);
const entry = join(repo, "packages", "engine", "server", "src", "main.ts");

function banner(msg) {
  process.stdout.write(`\n\x1b[1;36m=== ${msg} ===\x1b[0m\n\n`);
}

banner("Building TS engine  (bun build --compile)");
const build = spawnSync("bun", ["build", "--compile", entry, "--outfile", exe], {
  stdio: "inherit",
  cwd: repo,
  shell: isWin,
});
if (build.status !== 0 || !existsSync(exe)) {
  process.stderr.write("\n\x1b[1;31mTS engine build failed.\x1b[0m\n");
  process.exit(build.status ?? 1);
}

banner(`Launching desktop app -> TS engine\n    ${exe}`);
const dev = spawnSync("pnpm", ["--dir", "app", "tauri", "dev"], {
  stdio: "inherit",
  cwd: repo,
  shell: isWin,
  env: { ...process.env, HOUSTON_ENGINE_BIN: exe },
});
process.exit(dev.status ?? 0);
