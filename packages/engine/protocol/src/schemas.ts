/**
 * Zod schemas for inbound request validation.
 *
 * The Rust engine relies on serde to reject malformed bodies; the TS engine
 * uses these to do the same and to guard the hand-mirrored DTOs against drift
 * (the dominant risk called out when there's no Rust->TS codegen yet). One
 * schema per inbound body the engine accepts today; more land with their
 * routes.
 *
 * Casing matches the wire exactly (see `dtos.ts`): agent-file bodies are
 * snake_case, conversations are camelCase, workspace/agent/session bodies are
 * camelCase.
 */

import { z } from "zod";

// ---------- WebSocket ----------

export const clientRequestSchema = z.union([
  z.object({ op: z.literal("sub"), topics: z.array(z.string()) }),
  z.object({ op: z.literal("unsub"), topics: z.array(z.string()) }),
]);

export const engineEnvelopeSchema = z.object({
  v: z.number(),
  id: z.string(),
  kind: z.enum(["event", "req", "res", "ping", "pong"]),
  ts: z.number(),
  payload: z.unknown(),
});

// ---------- Workspaces ----------

export const createWorkspaceSchema = z.object({
  name: z.string().min(1),
  provider: z.string().optional(),
  model: z.string().optional(),
});

export const renameWorkspaceSchema = z.object({
  newName: z.string().min(1),
});

export const updateProviderSchema = z.object({
  provider: z.string(),
  model: z.string().optional(),
});

export const workspaceContextSchema = z.object({
  workspace: z.string(),
  user: z.string(),
});

// ---------- Agents ----------

export const createAgentSchema = z.object({
  name: z.string().min(1),
  configId: z.string(),
  color: z.string().optional(),
  claudeMd: z.string().optional(),
  installedPath: z.string().optional(),
  seeds: z.record(z.string()).optional(),
  existingPath: z.string().optional(),
});

export const updateAgentSchema = z.object({
  color: z.string(),
});

export const renameAgentSchema = z.object({
  newName: z.string().min(1),
});

// ---------- Agent files (snake_case bodies) ----------

export const agentPathBodySchema = z.object({
  agent_path: z.string().min(1),
});

export const readAgentFileBodySchema = z.object({
  agent_path: z.string().min(1),
  rel_path: z.string().min(1),
});

export const writeAgentFileBodySchema = z.object({
  agent_path: z.string().min(1),
  rel_path: z.string().min(1),
  content: z.string(),
});

export const renameFileBodySchema = z.object({
  agent_path: z.string().min(1),
  rel_path: z.string().min(1),
  new_name: z.string().min(1),
});

export const createFolderBodySchema = z.object({
  agent_path: z.string().min(1),
  folder_name: z.string().min(1),
});

// ---------- Agent config ----------

export const projectConfigSchema = z
  .object({
    name: z.string().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    effort: z.string().optional(),
  })
  .passthrough();

// ---------- Conversations (camelCase) ----------

export const conversationsListSchema = z.object({
  agentPath: z.string().min(1),
});

export const conversationsListAllSchema = z.object({
  agentPaths: z.array(z.string()),
});

// ---------- Preferences ----------

export const preferenceValueSchema = z.object({
  value: z.string(),
});

// ---------- Sessions ----------

export const sessionStartRequestSchema = z.object({
  sessionKey: z.string().min(1),
  prompt: z.string(),
  systemPrompt: z.string().optional(),
  source: z.string().optional(),
  workingDir: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
});

export const onboardingStartRequestSchema = z.object({
  sessionKey: z.string().min(1),
});
