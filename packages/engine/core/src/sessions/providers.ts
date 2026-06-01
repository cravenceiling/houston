/**
 * Provider + model resolution into a concrete pi model.
 *
 * The agent's `.houston/config/config.json` (or a per-turn override) gives a
 * provider id + model alias; this turns that into a `pi-ai` `Model`. The full
 * Houston-alias table and OAuth-backed providers land with the providers/auth
 * milestone (M4); today this maps provider ids to pi providers and passes the
 * model id through to pi's registry, surfacing an actionable error when it's
 * unknown. The resolver is injectable on `EngineState` so tests can substitute
 * a faux model at exactly this boundary.
 */

import { type Model, getModel } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { CoreError } from "../error.ts";

export interface ResolvedModel {
  model: Model<any>;
  /** Optional custom stream function (proxy/OAuth backends). Defaults to pi's `streamSimple`. */
  streamFn?: StreamFn;
}

export type ModelResolver = (providerId: string, modelAlias: string | undefined) => ResolvedModel;

/**
 * Houston provider id -> pi provider id. Houston `openai` means
 * "ChatGPT subscription via Codex" — its models live under pi's `openai-codex`
 * provider (the codex-responses backend at chatgpt.com/backend-api). The OAuth
 * access token is supplied per-request by the runtime's `getApiKey` callback,
 * which the resolved model reports as provider `openai-codex`.
 */
const PI_PROVIDER: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai-codex",
  "openai-codex": "openai-codex",
  gemini: "google",
};

/**
 * Houston short model aliases -> concrete pi model ids. Houston configs use
 * either a short alias ("sonnet") or a full id ("claude-opus-4-8"); full ids
 * pass through. Extend as new models ship.
 */
const ANTHROPIC_ALIAS: Record<string, string> = {
  sonnet: "claude-sonnet-4-5",
  opus: "claude-opus-4-8",
  haiku: "claude-haiku-4-5",
};

function resolveModelId(houstonProvider: string, alias: string): string {
  if (houstonProvider === "anthropic") return ANTHROPIC_ALIAS[alias] ?? alias;
  return alias;
}

export const defaultModelResolver: ModelResolver = (providerId, modelAlias) => {
  const piProvider = PI_PROVIDER[providerId] ?? providerId;
  if (!modelAlias) {
    throw CoreError.badRequest(
      `no model configured for provider "${providerId}"; set a model in the agent config`,
    );
  }
  const modelId = resolveModelId(providerId, modelAlias);
  let model: Model<any> | undefined;
  try {
    // Cast: the agent config carries arbitrary provider/model strings; pi's
    // registry validates them at runtime.
    model = getModel(piProvider as never, modelId as never) as Model<any> | undefined;
  } catch (e) {
    throw CoreError.badRequest(
      `unknown model "${modelId}" for provider "${providerId}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!model) {
    throw CoreError.badRequest(`unknown model "${modelId}" for provider "${providerId}"`);
  }
  return { model };
};
