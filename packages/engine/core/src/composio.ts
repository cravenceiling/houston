/**
 * Composio integration — read-only status surface.
 *
 * The full composio port (login, app connect/disconnect, the bundled CLI) is a
 * later milestone. For now we answer the boot-time status reads honestly from
 * the standalone CLI's install location so the integrations panel renders a
 * calm "not connected" state instead of erroring. Mirrors the not-installed /
 * not-authenticated branches of `houston-composio` and the infallible GET
 * handlers of `routes/composio.rs`.
 */

import { statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ComposioAppEntry, ComposioStatus } from "@houston-ai/engine-protocol";

/** Standalone composio CLI location (`~/.composio/composio[.exe]`). */
function standaloneCliPath(): string {
  const bin = process.platform === "win32" ? "composio.exe" : "composio";
  return join(homedir(), ".composio", bin);
}

/**
 * True if the standalone composio CLI is present and executable. Mirrors
 * `houston_composio::install::is_installed` minus the bundled-binary path,
 * which the TS engine doesn't ship.
 */
export function composioCliInstalled(): boolean {
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(standaloneCliPath());
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  if (process.platform === "win32") return true;
  return (st.mode & 0o111) !== 0; // some +x bit set
}

/**
 * Composio auth status. Without the full CLI port we never shell out to
 * `composio whoami`, so we report `not_installed` when the CLI is absent and
 * `needs_auth` when it's present — never a false `ok`.
 */
export function composioStatus(): ComposioStatus {
  return composioCliInstalled() ? { status: "needs_auth" } : { status: "not_installed" };
}

/** Connectable composio apps. Empty until the composio milestone lands. */
export function composioApps(): ComposioAppEntry[] {
  return [];
}

/** Connected toolkit slugs. Empty until the composio milestone lands. */
export function composioConnectedToolkits(): string[] {
  return [];
}
