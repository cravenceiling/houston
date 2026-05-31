import { Hono } from "hono";
import { empty } from "../http.ts";

/**
 * Claude Code installer status — reported as installed.
 *
 * The Rust engine downloads the proprietary Claude Code CLI at runtime and the
 * onboarding "Sign in with Anthropic" card reads this to know whether to show a
 * download step. The TS engine runs the loop in-process via pi and never needs
 * that CLI, so it is honestly "installed" — which makes the app skip the
 * download path and go straight to OAuth login.
 */
export function claudeRoutes(): Hono {
  const r = new Hono();
  r.get("/claude/cli-installed", (c) => c.json({ installed: true }));
  r.get("/claude/status", (c) =>
    c.json({
      installed: true,
      installPath: "",
      pinnedVersion: null,
      installedVersion: null,
      lastInstallError: null,
    }),
  );
  r.post("/claude/install", () => empty());
  return r;
}
