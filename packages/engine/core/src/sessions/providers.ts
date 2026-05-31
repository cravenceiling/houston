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

/** Houston provider id -> pi provider id. */
const PI_PROVIDER: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  gemini: "google",
};

export const defaultModelResolver: ModelResolver = (providerId, modelAlias) => {
  const piProvider = PI_PROVIDER[providerId] ?? providerId;
  if (!modelAlias) {
    throw CoreError.badRequest(
      `no model configured for provider "${providerId}"; set a model in the agent config`,
    );
  }
  let model: Model<any> | undefined;
  try {
    // Cast: the agent config carries arbitrary provider/model strings; pi's
    // registry validates them at runtime.
    model = getModel(piProvider as never, modelAlias as never) as Model<any> | undefined;
  } catch (e) {
    throw CoreError.badRequest(
      `unknown model "${modelAlias}" for provider "${providerId}": ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!model) {
    throw CoreError.badRequest(`unknown model "${modelAlias}" for provider "${providerId}"`);
  }
  return { model };
};
