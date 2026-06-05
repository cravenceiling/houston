/**
 * REST domain DTOs.
 *
 * Hand-mirrored from `ui/engine-client/src/types.ts` (itself a mirror of the
 * Rust DTOs in `engine/houston-engine-core`). This file covers the routes the
 * TypeScript engine implements today (health, workspaces, agents, agent data +
 * files, conversations, preferences, sessions). DTO families for later
 * milestones — store, skills, composio, portable, tunnel, push, attachments,
 * worktree, claude installer — land alongside their routes.
 *
 * Casing is load-bearing and intentionally inconsistent per-route, exactly as
 * the Rust serde attributes dictate: workspace/agent DTOs are camelCase;
 * `.houston/` data files (Activity, Routine, ProjectConfig, ProjectFile) are
 * snake_case; agent-file request bodies use snake_case; conversations use
 * camelCase. Do not "normalize" these.
 */

// ---------- Workspaces ----------

export interface Workspace {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  provider?: string;
  model?: string;
}

export interface CreateWorkspace {
  name: string;
  provider?: string;
  model?: string;
}

export interface RenameWorkspace {
  newName: string;
}

export interface UpdateProvider {
  provider: string;
  model?: string;
}

export interface WorkspaceContext {
  workspace: string;
  user: string;
}

// ---------- Workspace-scoped agent CRUD ----------

export interface Agent {
  id: string;
  name: string;
  folderPath: string;
  configId: string;
  color?: string;
  createdAt: string;
  lastOpenedAt?: string;
}

export interface CreateAgent {
  name: string;
  configId: string;
  color?: string;
  claudeMd?: string;
  installedPath?: string;
  seeds?: Record<string, string>;
  existingPath?: string;
}

export interface CreateAgentResult {
  agent: Agent;
}

export interface UpdateAgent {
  color: string;
}

// ---------- Agent data files (snake_case on disk) ----------

export interface Activity {
  id: string;
  title: string;
  description: string;
  status: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  worktree_path?: string | null;
  routine_id?: string;
  routine_run_id?: string;
  updated_at?: string;
  provider?: string;
  model?: string;
}

export interface ActivityUpdate {
  title?: string;
  description?: string;
  status?: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  worktree_path?: string | null;
  routine_id?: string;
  routine_run_id?: string;
  provider?: string;
  model?: string;
}

export interface NewActivity {
  title: string;
  description?: string;
  agent?: string;
  worktree_path?: string;
  provider?: string;
  model?: string;
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  prompt: string;
  schedule: string;
  enabled: boolean;
  suppress_when_silent: boolean;
  timezone?: string | null;
  integrations: string[];
  created_at: string;
  updated_at: string;
}

export interface NewRoutine {
  name: string;
  description?: string;
  prompt: string;
  schedule: string;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  timezone?: string | null;
  integrations?: string[];
}

export interface RoutineUpdate {
  name?: string;
  description?: string;
  prompt?: string;
  schedule?: string;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  timezone?: string | null;
  integrations?: string[];
}

export type RoutineRunStatus = "running" | "silent" | "surfaced" | "error" | "cancelled";

export interface RoutineRun {
  id: string;
  routine_id: string;
  status: RoutineRunStatus;
  session_key: string;
  activity_id?: string;
  summary?: string;
  started_at: string;
  completed_at?: string;
  paused_until?: string;
}

export interface RoutineRunUpdate {
  status?: RoutineRunStatus;
  activity_id?: string;
  summary?: string;
  completed_at?: string;
  paused_until?: string | null;
}

export interface ProjectConfig {
  name?: string;
  provider?: string;
  model?: string;
  effort?: string;
  [extra: string]: unknown;
}

export interface ProjectFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  is_directory: boolean;
  date_modified?: number;
}

export interface InstalledConfig {
  config: unknown;
  path: string;
}

// ---------- Conversations (camelCase request, snake_case row) ----------

export interface ConversationEntry {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type: string;
  session_key: string;
  updated_at?: string;
  agent_path: string;
  agent_name: string;
  agent?: string;
  routine_id?: string;
  worktree_path?: string;
}

// ---------- Preferences ----------

export interface PreferenceValue {
  value: string | null;
}

export type KnownPreferenceKey = "timezone" | "locale" | "legal_acceptance";

// ---------- Sessions ----------

export interface SessionStartRequest {
  sessionKey: string;
  prompt: string;
  systemPrompt?: string;
  source?: string;
  workingDir?: string;
  provider?: string;
  model?: string;
  effort?: string;
}

export interface SessionStartResponse {
  sessionKey: string;
}

export interface SessionCancelResponse {
  cancelled: boolean;
}

export interface ChatHistoryEntry {
  feed_type: string;
  data: unknown;
}

export interface SummarizeResult {
  title: string;
  description: string;
}

export interface SummarizeOptions {
  agentPath?: string;
  provider?: string;
  model?: string;
}

export interface SuggestedIntegration {
  slug: string;
  displayName: string;
}

export interface SuggestedRoutine {
  name: string;
  prompt: string;
  schedule: string;
}

export interface GenerateInstructionsResult {
  name: string;
  instructions: string;
  suggestedIntegrations: SuggestedIntegration[];
  suggestedRoutine?: SuggestedRoutine | null;
}

// ---------- Providers ----------

export type CliInstallSource = "bundled" | "managed" | "path" | "missing";
export type ProviderAuthState = "authenticated" | "unauthenticated" | "unknown";

export interface ProviderStatus {
  provider: string;
  cliInstalled: boolean;
  authState: ProviderAuthState;
  cliName: string;
  installSource: CliInstallSource;
  cliPath: string | null;
}

// ---------- Claude Code installer (TS engine reports installed: it uses pi, not the CLI) ----------

export interface ClaudeStatus {
  installed: boolean;
  installPath: string;
  pinnedVersion: string | null;
  installedVersion: string | null;
  lastInstallError: unknown | null;
}

// ---------- Agent store (snake_case, matches the store API + on-disk JSON) ----------

export interface StoreListing {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  tags: string[];
  icon_url: string;
  integrations: string[];
  repo: string;
  installs: number;
  registered_at: string;
  version?: string | null;
  content_hash?: string | null;
  bundled: boolean;
}

// ---------- Composio (tagged status; entries are snake_case) ----------

export type ComposioStatus =
  | { status: "not_installed" }
  | { status: "needs_auth" }
  | { status: "ok"; email: string | null; org_name: string | null }
  | { status: "error"; message: string };

export interface ComposioAppEntry {
  toolkit: string;
  name: string;
  description: string;
  logo_url: string;
  categories: string[];
}

// ---------- Mobile tunnel (camelCase) ----------

export interface TunnelStatus {
  connected: boolean;
  tunnelId: string | null;
  publicHost: string | null;
  lastActivityMs: number | null;
}
