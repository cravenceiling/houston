/**
 * Agent configs — installed agent manifests under `<home>/agents`.
 *
 * Port of `houston-engine-core/src/agent_configs.rs`. Each subdirectory of
 * `<home>/agents` that holds a valid `houston.json` contributes one entry;
 * malformed or unreadable manifests are skipped with a warning (the same
 * lenient behavior as the Rust side). The directory is created if missing so a
 * fresh home returns `[]` rather than erroring.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { InstalledConfig } from "@houston-ai/engine-protocol";
import { log } from "./log.ts";

/** List every installed agent config under `<home>/agents`. */
export function listInstalledConfigs(home: string): InstalledConfig[] {
  const dir = join(home, "agents");
  mkdirSync(dir, { recursive: true });

  const configs: InstalledConfig[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      continue; // races / broken symlinks behave like "not a dir"
    }
    if (!isDir) continue;

    const configPath = join(path, "houston.json");
    if (!existsSync(configPath)) continue;

    let contents: string;
    try {
      contents = readFileSync(configPath, "utf-8");
    } catch (e) {
      log.warn(`[agent-configs] failed to read ${configPath}: ${e}`);
      continue;
    }
    try {
      configs.push({ config: JSON.parse(contents) as unknown, path });
    } catch (e) {
      log.warn(`[agent-configs] failed to parse ${configPath}: ${e}`);
    }
  }
  return configs;
}
