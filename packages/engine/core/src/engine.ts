/**
 * Engine runtime container.
 *
 * The TS analogue of `houston-engine-core::EngineState` / the server's
 * `ServerState`: the single object route handlers and the session runtime
 * receive. Holds the resolved config, path helpers, the event bus, the SQLite
 * handle, the turn controller, and the model resolver (injectable so tests can
 * substitute a faux model at the provider boundary).
 */

import type { EngineConfig } from "./config.ts";
import { EnginePaths } from "./paths.ts";
import { EventBus } from "./events.ts";
import { Db } from "./db.ts";
import { TurnControl } from "./sessions/control.ts";
import { type ModelResolver, defaultModelResolver } from "./sessions/providers.ts";

export interface EngineOptions {
  /** Override how a provider + model alias resolves to a pi model. */
  modelResolver?: ModelResolver;
}

export class EngineState {
  readonly config: EngineConfig;
  readonly paths: EnginePaths;
  readonly events: EventBus;
  readonly db: Db;
  readonly control: TurnControl;
  readonly modelResolver: ModelResolver;

  constructor(config: EngineConfig, options: EngineOptions = {}) {
    this.config = config;
    this.paths = new EnginePaths(config.docsDir, config.homeDir);
    this.events = new EventBus();
    this.db = new Db(this.paths.dbPath());
    this.control = new TurnControl();
    this.modelResolver = options.modelResolver ?? defaultModelResolver;
  }
}
