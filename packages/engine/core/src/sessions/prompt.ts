/**
 * Agent system-prompt assembly + skeleton seeding.
 *
 * Port of `houston-engine-core/src/agents/prompt.rs` (+ `learnings_context.rs`).
 * `buildAgentContext` assembles everything the engine knows about the agent's
 * filesystem layout — working dir, mode overlay, learnings snapshot, skills
 * index, workspace/user context, prior integrations — with NO product voice.
 * The caller (the app) prepends its product prompt. `seedAgent` lays down the
 * editable role file + CLI mirrors + prompt scaffold on first run.
 */

import {
  existsSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const SECTION_SEP = "\n\n---\n\n";

export const DEFAULT_CLAUDE_MD = `# Houston Agent

## Role
You are a helpful AI assistant.

## Rules
- Be concise and direct
- Ask before making destructive changes
- Explain your reasoning when making decisions
`;

function seedFile(dir: string, name: string, content: string): void {
  const path = join(dir, name);
  if (!existsSync(path)) writeFileSync(path, content);
}

/** Expose CLAUDE.md to a sibling CLI's memory filename via symlink (copy fallback). */
function linkOrCopyRoleFile(dir: string, linkName: string): void {
  const linkPath = join(dir, linkName);
  try {
    lstatSync(linkPath); // exists (even dangling) -> never clobber
    return;
  } catch {
    /* doesn't exist — create it */
  }
  try {
    symlinkSync("CLAUDE.md", linkPath);
    return;
  } catch {
    /* symlink denied — fall back to a copy */
  }
  try {
    copyFileSync(join(dir, "CLAUDE.md"), linkPath);
  } catch {
    /* best effort */
  }
}

/** Seed the Houston agent skeleton (CLAUDE.md + AGENTS/GEMINI mirrors + prompts dir). */
export function seedAgent(dir: string): void {
  seedFile(dir, "CLAUDE.md", DEFAULT_CLAUDE_MD);
  linkOrCopyRoleFile(dir, "AGENTS.md");
  linkOrCopyRoleFile(dir, "GEMINI.md");
  mkdirSync(join(dir, ".houston", "prompts", "modes"), { recursive: true });
}

// ---------------------------------------------------------------------------
// Learnings snapshot
// ---------------------------------------------------------------------------

const LEARNINGS_LIMIT = 4000;
const INJECTION_NEEDLES = [
  "ignore previous instructions", "ignore all instructions", "ignore above instructions",
  "ignore prior instructions", "system prompt override", "disregard your instructions",
  "disregard all instructions", "do not tell the user", "you are now",
];
const INVISIBLE = /[​‌‍⁠﻿‪‫‬‭‮]/g;

function buildLearningsContext(agentDir: string): string | null {
  const path = join(agentDir, ".houston", "learnings", "learnings.json");
  if (!existsSync(path)) return null;
  let entries: unknown;
  try {
    entries = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
  if (!Array.isArray(entries)) return null;
  const learnings: string[] = [];
  for (const entry of entries) {
    const text = (entry as { text?: unknown }).text;
    if (typeof text !== "string") continue;
    const clean = text.replace(INVISIBLE, "").trim();
    if (!clean) continue;
    if (INJECTION_NEEDLES.some((n) => clean.toLowerCase().includes(n))) continue;
    learnings.push(clean);
  }
  if (learnings.length === 0) return null;

  const header = "# Persistent Learnings - Frozen Snapshot\n\n";
  let body = "";
  for (const l of learnings) {
    const line = `- ${l}\n`;
    if (header.length + body.length + line.length > LEARNINGS_LIMIT) break;
    body += line;
  }
  return body ? header + body : null;
}

// ---------------------------------------------------------------------------
// Workspace/user context (parent dir, if it is a workspace)
// ---------------------------------------------------------------------------

function buildWorkspaceSection(workspaceDir: string): string | null {
  if (!existsSync(join(workspaceDir, ".houston"))) return null; // not a workspace
  const parts: string[] = [];
  const ws = tryRead(join(workspaceDir, "WORKSPACE.md"));
  if (ws) parts.push(`# Workspace Context\n\n${ws}`);
  const user = tryRead(join(workspaceDir, "USER.md"));
  if (user) parts.push(`# User Context\n\n${user}`);
  return parts.length ? parts.join(SECTION_SEP) : null;
}

// ---------------------------------------------------------------------------
// Skills index (.agents/skills)
// ---------------------------------------------------------------------------

function buildSkillsIndex(agentDir: string): string | null {
  const skillsDir = join(agentDir, ".agents", "skills");
  if (!existsSync(skillsDir)) return null;
  const lines: string[] = [];
  for (const ent of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const skillMd = join(skillsDir, ent.name, "SKILL.md");
    const content = tryRead(skillMd);
    if (!content) continue;
    const { name, description } = parseFrontmatter(content);
    lines.push(`- **${name ?? ent.name}**${description ? `: ${description}` : ""}`);
  }
  if (lines.length === 0) return null;
  return `# Available Skills\n\n${lines.join("\n")}`;
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: { name?: string; description?: string } = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(name|description):\s*(.*)$/);
    if (kv) out[kv[1] as "name" | "description"] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

function buildIntegrations(agentDir: string): string | null {
  const content = tryRead(join(agentDir, ".houston", "integrations.json"));
  if (!content) return null;
  let names: string[] = [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      names = parsed
        .map((v) => (v && typeof v === "object" ? (v as { toolkit?: string }).toolkit : undefined))
        .filter((v): v is string => typeof v === "string");
    } else if (parsed && typeof parsed === "object") {
      names = Object.keys(parsed);
    }
  } catch {
    return null;
  }
  if (names.length === 0) return null;
  return (
    `# Integrations - Previously Used\n\n` +
    `You have used these Composio integrations in past sessions: ${names.join(", ")}.\n` +
    `Prefer these when the task involves their services.`
  );
}

// ---------------------------------------------------------------------------

function tryRead(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

/** Assemble the per-agent context block from disk (product-neutral). */
export function buildAgentContext(
  agentDir: string,
  workingDirOverride?: string,
  mode?: string,
): string {
  const parts: string[] = [];
  const effectiveDir = workingDirOverride ?? agentDir;

  parts.push(
    `# Working Directory - MANDATORY\n\n` +
      `Your working directory is: \`${effectiveDir}\`\n\n` +
      `**CRITICAL RULES:**\n` +
      `- ALL files you create, read, or modify MUST be within this directory.\n` +
      `- NEVER create files outside this directory.\n` +
      `- Skills go in \`.agents/skills/\` (relative to this directory).\n` +
      `- Houston data goes in \`.houston/\` (relative to this directory).\n` +
      `- When referencing paths, always use paths relative to or inside \`${effectiveDir}\`.`,
  );

  if (mode) {
    const modeContent =
      tryRead(join(agentDir, ".houston", "prompts", "modes", `${mode}.md`)) ??
      tryRead(join(agentDir, ".houston", "prompts", `${mode}.md`));
    if (modeContent) parts.push(modeContent);
  }

  const learnings = buildLearningsContext(agentDir);
  if (learnings) parts.push(learnings);

  const skills = buildSkillsIndex(agentDir);
  if (skills) parts.push(skills);

  const workspace = buildWorkspaceSection(dirname(agentDir));
  if (workspace) parts.push(workspace);

  const integrations = buildIntegrations(agentDir);
  if (integrations) parts.push(integrations);

  return parts.join(SECTION_SEP);
}

/** Final session prompt: product prompt (if any) then the agent context. */
export function assembleSessionPrompt(productPrompt: string, agentContext: string): string {
  const product = productPrompt.trim();
  return product ? `${product}${SECTION_SEP}${agentContext}` : agentContext;
}
