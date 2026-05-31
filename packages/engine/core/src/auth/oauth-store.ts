/**
 * OAuth credential storage.
 *
 * Persists pi-ai `OAuthCredentials` per provider at `<home>/oauth/auth.json`
 * (mode 0600), keyed by the pi OAuth provider id (`anthropic`, `openai-codex`).
 * The Rust engine delegated credential storage to each provider CLI's own
 * files; running the loop in-process means the engine owns the tokens.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "../log.ts";

export interface StoredOAuth {
  refresh: string;
  access: string;
  expires: number;
  [extra: string]: unknown;
}

export class OAuthStore {
  private readonly path: string;
  private data: Record<string, StoredOAuth> = {};

  constructor(homeDir: string) {
    this.path = join(homeDir, "oauth", "auth.json");
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.path)) {
        this.data = JSON.parse(readFileSync(this.path, "utf-8")) as Record<string, StoredOAuth>;
      }
    } catch (e) {
      log.warn("[oauth] failed to read auth.json, starting empty:", e);
      this.data = {};
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
    try {
      chmodSync(this.path, 0o600);
    } catch {
      /* non-Unix filesystems don't support chmod */
    }
  }

  has(id: string): boolean {
    return id in this.data;
  }
  get(id: string): StoredOAuth | undefined {
    return this.data[id];
  }
  set(id: string, creds: StoredOAuth): void {
    this.data[id] = creds;
    this.persist();
  }
  remove(id: string): void {
    delete this.data[id];
    this.persist();
  }
}
