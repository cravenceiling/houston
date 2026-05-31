/**
 * Engine configuration, loaded from environment variables.
 *
 * Faithful port of `engine/houston-engine-server/src/config.rs::from_env`. The
 * desktop supervisor passes these at spawn; standalone deploys set them
 * directly. Env names must match exactly — they are the spawn contract.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Default Houston relay base URL. Mobile companion dials this; the desktop
 * engine's reverse tunnel registers here. Overridable via `HOUSTON_TUNNEL_URL`.
 * Mirrors `DEFAULT_RELAY_URL` in `config.rs`.
 */
export const DEFAULT_RELAY_URL = "https://tunnel.gethouston.ai";

export interface EngineConfig {
  /** Bind host. Default `127.0.0.1`. */
  bindHost: string;
  /** Bind port. `0` selects a random free port (resolved after listen). */
  bindPort: number;
  /** Bearer token clients must present. Auto-generated when unset. */
  token: string;
  /** Houston home directory (`~/.houston`). Holds `engine.json`, the DB. */
  homeDir: string;
  /** Workspaces root (`<home>/workspaces`). */
  docsDir: string;
  /** Product system prompt from the app (`HOUSTON_APP_SYSTEM_PROMPT`). */
  appSystemPrompt: string;
  /** Product onboarding prompt from the app (`HOUSTON_APP_ONBOARDING_PROMPT`). */
  appOnboardingPrompt: string;
  /** Relay base URL. */
  tunnelUrl: string;
}

/** Split a `host:port` bind string, tolerating IPv6 `[::1]:0`. */
function splitHostPort(raw: string): { host: string; port: number } {
  const v6 = raw.match(/^\[(.+)\]:(\d+)$/);
  if (v6) return { host: v6[1], port: Number.parseInt(v6[2], 10) };
  const idx = raw.lastIndexOf(":");
  if (idx === -1) return { host: raw, port: 0 };
  return { host: raw.slice(0, idx), port: Number.parseInt(raw.slice(idx + 1), 10) || 0 };
}

/** 48-char alphanumeric token, matching the Rust `gen_token`. */
export function genToken(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(48);
  let out = "";
  for (let i = 0; i < 48; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function isUnspecified(host: string): boolean {
  return host === "0.0.0.0" || host === "::" || host === "[::]";
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const { host: bindHost, port: bindPort } = splitHostPort(env.HOUSTON_BIND ?? "127.0.0.1:0");

  if (isUnspecified(bindHost) && env.HOUSTON_BIND_ALL !== "1") {
    throw new Error("Refusing to bind 0.0.0.0 without HOUSTON_BIND_ALL=1");
  }

  const token = env.HOUSTON_ENGINE_TOKEN || genToken();

  const homeDir = env.HOUSTON_HOME || join(homedir(), ".houston");
  // Workspaces always live under `<home>/workspaces`. The desktop app handles
  // the one-time migration from the legacy `~/Documents/Houston` path.
  const docsDir = env.HOUSTON_DOCS || join(homeDir, "workspaces");

  return {
    bindHost,
    bindPort,
    token,
    homeDir,
    docsDir,
    appSystemPrompt: env.HOUSTON_APP_SYSTEM_PROMPT ?? "",
    appOnboardingPrompt: env.HOUSTON_APP_ONBOARDING_PROMPT ?? "",
    tunnelUrl: env.HOUSTON_TUNNEL_URL && env.HOUSTON_TUNNEL_URL.length > 0
      ? env.HOUSTON_TUNNEL_URL
      : DEFAULT_RELAY_URL,
  };
}
