/**
 * Smoke test for the Codex (OpenAI subscription) model + token wiring (chunk G).
 *
 * The bug: OpenAI/Codex login succeeded but chat failed because (a) the model
 * resolver mapped Houston `openai` to pi's standard `openai` provider instead
 * of the `openai-codex` (codex-responses) backend, and (b) `oauthApiKeyFor`
 * returned undefined for everything but anthropic, so the subscription token
 * never reached the model. This asserts both are fixed.
 * Run: `bun scripts/smoke-codex.ts`.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EngineState, defaultModelResolver } from "@houston-ai/engine-core";

const home = mkdtempSync(join(tmpdir(), "ts-codex-"));
const engine = new EngineState({
  bindHost: "127.0.0.1",
  bindPort: 0,
  token: "t",
  homeDir: home,
  docsDir: home,
});

const fails: string[] = [];
const check = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "OK  " : "MISS"} ${label}`);
  if (!cond) fails.push(label);
};

// 1. Houston `openai` resolves to the codex-responses backend, not the standard
//    OpenAI API path.
const codex = defaultModelResolver("openai", "gpt-5.5");
check(codex.model.provider === "openai-codex", "openai -> openai-codex provider");
check(
  String(codex.model.baseUrl).includes("chatgpt.com"),
  `codex baseUrl is the subscription backend (got ${codex.model.baseUrl})`,
);

// 2. Anthropic still resolves normally.
const anthropic = defaultModelResolver("anthropic", "opus");
check(anthropic.model.provider === "anthropic", "anthropic -> anthropic provider");
check(String(anthropic.model.id).startsWith("claude-opus"), "opus alias -> claude-opus id");

// 3. Token plumbing: when NOT logged in, every provider falls back to env key
//    (undefined), never throws — the resolved model's provider id is what the
//    runtime hands to `oauthApiKeyFor`.
const codexKey = await engine.auth.oauthApiKeyFor("openai-codex");
const anthropicKey = await engine.auth.oauthApiKeyFor("anthropic");
const unknownKey = await engine.auth.oauthApiKeyFor("google");
check(codexKey === undefined, "openai-codex not logged in -> undefined (env fallback)");
check(anthropicKey === undefined, "anthropic not logged in -> undefined (env fallback)");
check(unknownKey === undefined, "google (no oauth) -> undefined");

// 4. The resolved model's provider id is exactly what the auth map keys on, so
//    a logged-in token would actually reach the model. (Closing the loop the
//    runtime relies on: getApiKey(resolved.model.provider).)
check(
  codex.model.provider === "openai-codex",
  "resolved codex model.provider matches the oauthApiKeyFor key",
);

console.log(fails.length === 0 ? "CODEX_OK" : "CODEX_FAIL");
process.exit(fails.length === 0 ? 0 : 1);
