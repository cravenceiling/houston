/**
 * Skills CRUD — port of `houston-skills` (format + validate + lib) plus the
 * engine wrapper `houston-engine-core::skills`.
 *
 * Skills are directories holding a `SKILL.md` (YAML frontmatter + markdown body)
 * under `<workspace>/.agents/skills/<name>/SKILL.md` — the skill.sh / Claude Code
 * convention. A `.claude/skills/<name>` symlink is created alongside so Claude
 * Code discovers them natively. Mutations emit `SkillsChanged` on the bus, which
 * is what flips the onboarding "Skill" mission to done.
 *
 * Remote install (skills.sh community + GitHub repos) is a later milestone; this
 * is the local surface the desktop app + onboarding need.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  lstatSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CoreError } from "./error.ts";
import type { EventBus } from "./events.ts";
import { log } from "./log.ts";

// ── Types (wire DTOs, camelCase) ───────────────────────────────────────────

export type SkillInputKind = "text" | "textarea" | "select";

export interface SkillInput {
  name: string;
  label: string;
  placeholder?: string;
  type: SkillInputKind;
  required: boolean;
  default?: string;
  options: string[];
}

export interface SkillSummary {
  name: string;
  description: string;
  version: number;
  tags: string[];
  created: string | null;
  lastUsed: string | null;
  category: string | null;
  featured: boolean;
  integrations: string[];
  image: string | null;
  inputs: SkillInput[];
  promptTemplate: string | null;
}

export interface SkillDetail {
  name: string;
  description: string;
  version: number;
  content: string;
}

export interface CreateSkillRequest {
  workspacePath: string;
  name: string;
  description: string;
  content: string;
}

export interface SaveSkillRequest {
  workspacePath: string;
  content: string;
}

// ── Errors (kinds match `ui/skills/src/skill-error-kinds.ts`) ───────────────

const skillNotFound = (s: string) =>
  CoreError.labeled("NOT_FOUND", "skill_not_found", `Skill not found: ${s}`);
const alreadyExists = (s: string) =>
  CoreError.labeled("CONFLICT", "already_installed", `'${s}' is already installed.`);
const validationErr = (m: string) => CoreError.labeled("BAD_REQUEST", "validation", m);
const parseErr = (m: string) => CoreError.labeled("BAD_REQUEST", "parse_failed", m);

// ── Validation (port of validate.rs) ────────────────────────────────────────

const MAX_NAME_LEN = 64;
const MAX_DESCRIPTION_LEN = 256;
const MAX_CONTENT_LEN = 50_000;

function validateName(name: string): void {
  if (name.length === 0) throw validationErr("Name cannot be empty");
  if (name.length > MAX_NAME_LEN) throw validationErr(`Name exceeds ${MAX_NAME_LEN} characters`);
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw validationErr("Name must be lowercase alphanumeric + hyphens only");
  }
}

function validateDescription(desc: string): void {
  if (desc.length > MAX_DESCRIPTION_LEN) {
    throw validationErr(`Description exceeds ${MAX_DESCRIPTION_LEN} characters`);
  }
}

function validateContent(content: string): void {
  if (content.length > MAX_CONTENT_LEN) {
    throw validationErr(`Content exceeds ${MAX_CONTENT_LEN} characters`);
  }
}

// ── Frontmatter parse/serialize (port of format.rs) ──────────────────────────

interface ParsedYaml {
  [k: string]: unknown;
}

function parseYaml(text: string): ParsedYaml {
  // The engine runs under Bun, which ships a YAML parser. Guard for non-Bun
  // (tests under node) by falling back to the `yaml` module if present.
  const bun = (globalThis as { Bun?: { YAML?: { parse(s: string): unknown } } }).Bun;
  if (bun?.YAML) return (bun.YAML.parse(text) as ParsedYaml) ?? {};
  throw parseErr("no YAML parser available");
}

function coerceBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    return ["yes", "true", "1", "on", "y"].includes(v.trim().toLowerCase());
  }
  return false;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function nonEmpty(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/** Split SKILL.md into frontmatter text + body. Mirrors `split_frontmatter`. */
function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const trimmed = content.replace(/^\s+/, "");
  if (!trimmed.startsWith("---")) throw parseErr("Missing opening --- delimiter");
  let afterFirst = trimmed.slice(3);
  if (afterFirst.startsWith("\n")) afterFirst = afterFirst.slice(1);
  const endIdx = afterFirst.indexOf("\n---");
  if (endIdx === -1) throw parseErr("Missing closing --- delimiter");
  const frontmatter = afterFirst.slice(0, endIdx);
  const bodyStart = endIdx + 4; // "\n---"
  const body =
    bodyStart < afterFirst.length ? afterFirst.slice(bodyStart).replace(/^\n+/, "") : "";
  return { frontmatter, body };
}

function parseInput(raw: ParsedYaml): SkillInput {
  const kindRaw = typeof raw.type === "string" ? raw.type.toLowerCase() : "text";
  const kind: SkillInputKind =
    kindRaw === "textarea" || kindRaw === "select" ? kindRaw : "text";
  const input: SkillInput = {
    name: String(raw.name ?? ""),
    label: String(raw.label ?? ""),
    type: kind,
    required: raw.required === undefined ? true : coerceBool(raw.required),
    options: asStringArray(raw.options),
  };
  if (typeof raw.placeholder === "string") input.placeholder = raw.placeholder;
  if (typeof raw.default === "string") input.default = raw.default;
  return input;
}

/** Parse SKILL.md content into a summary + body. Mirrors `parse_content`. */
export function parseSkillContent(content: string): { summary: SkillSummary; body: string } {
  const { frontmatter, body } = splitFrontmatter(content);
  const fm = parseYaml(frontmatter);
  const name = typeof fm.name === "string" ? fm.name : "";
  if (name.trim().length === 0) throw parseErr("Missing 'name' in frontmatter");
  const summary: SkillSummary = {
    name,
    description: typeof fm.description === "string" ? fm.description : "",
    version: typeof fm.version === "number" ? fm.version : 1,
    tags: asStringArray(fm.tags),
    created: typeof fm.created === "string" ? fm.created : null,
    lastUsed: typeof fm.last_used === "string" ? fm.last_used : null,
    category: nonEmpty(fm.category),
    featured: coerceBool(fm.featured),
    integrations: asStringArray(fm.integrations),
    image: nonEmpty(fm.image),
    inputs: Array.isArray(fm.inputs) ? fm.inputs.map((i) => parseInput(i as ParsedYaml)) : [],
    promptTemplate: nonEmpty(fm.prompt_template),
  };
  return { summary, body };
}

/** Serialize a summary + body back to SKILL.md. Mirrors `serialize` exactly. */
export function serializeSkill(summary: SkillSummary, body: string): string {
  let out = "---\n";
  out += `name: ${summary.name}\n`;
  out += `description: ${summary.description}\n`;
  out += `version: ${summary.version}\n`;
  out += summary.tags.length > 0 ? `tags: [${summary.tags.join(", ")}]\n` : "tags: []\n";
  if (summary.created) out += `created: ${summary.created}\n`;
  if (summary.lastUsed) out += `last_used: ${summary.lastUsed}\n`;
  if (summary.category) out += `category: ${summary.category}\n`;
  if (summary.featured) out += "featured: yes\n";
  if (summary.integrations.length > 0) out += `integrations: [${summary.integrations.join(", ")}]\n`;
  if (summary.image) out += `image: ${summary.image}\n`;
  if (summary.inputs.length > 0) {
    out += "inputs:\n";
    for (const input of summary.inputs) {
      out += `  - name: ${input.name}\n`;
      out += `    label: ${input.label}\n`;
      if (input.placeholder) out += `    placeholder: ${input.placeholder}\n`;
      if (input.type !== "text") out += `    type: ${input.type}\n`;
      if (!input.required) out += "    required: false\n";
      if (input.default) out += `    default: ${input.default}\n`;
      if (input.options.length > 0) out += `    options: [${input.options.join(", ")}]\n`;
    }
  }
  if (summary.promptTemplate) {
    if (summary.promptTemplate.includes("\n")) {
      out += "prompt_template: |\n";
      for (const line of summary.promptTemplate.split("\n")) out += `  ${line}\n`;
    } else {
      out += `prompt_template: ${summary.promptTemplate}\n`;
    }
  }
  out += "---\n";
  if (body.length > 0) {
    out += `\n${body}`;
    if (!body.endsWith("\n")) out += "\n";
  }
  return out;
}

// ── Filesystem helpers ───────────────────────────────────────────────────────

function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(2));
  return p;
}

function skillsDir(workspacePath: string): string {
  return join(expandTilde(workspacePath), ".agents", "skills");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, matches chrono format
}

/** Create `.claude/skills/<name>` → `../../.agents/skills/<name>` symlink (idempotent). */
function ensureClaudeSymlink(workspacePath: string, name: string): void {
  const root = expandTilde(workspacePath);
  const claudeSkills = join(root, ".claude", "skills");
  mkdirSync(claudeSkills, { recursive: true });
  const link = join(claudeSkills, name);
  if (!existsSync(link)) {
    try {
      symlinkSync(join("..", "..", ".agents", "skills", name), link, "dir");
    } catch {
      /* symlink denied (Windows w/o privilege) — Claude Code discovery degrades, non-fatal */
    }
  }
}

function removeClaudeSymlink(workspacePath: string, name: string): void {
  const link = join(expandTilde(workspacePath), ".claude", "skills", name);
  try {
    lstatSync(link);
    rmSync(link, { force: true });
  } catch {
    /* not present — nothing to remove */
  }
}

function emitSkillsChanged(events: EventBus, workspacePath: string): void {
  events.emit({ type: "SkillsChanged", data: { agent_path: workspacePath } });
}

// ── Flat-file migration (port of migrate_flat_files) ─────────────────────────

function migrateFlatFiles(dir: string): void {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith(".md")) continue;
    const stem = ent.name.slice(0, -3);
    if (stem.startsWith(".")) continue;
    const targetDir = join(dir, stem);
    if (existsSync(targetDir)) {
      log.warn(`[skills] skipping migration of ${ent.name}: target exists`);
      continue;
    }
    mkdirSync(targetDir, { recursive: true });
    renameSync(join(dir, ent.name), join(targetDir, "SKILL.md"));
    log.info(`[skills] migrated flat skill ${ent.name} -> ${stem}/SKILL.md`);
  }
}

// ── Public API (port of skills.rs) ───────────────────────────────────────────

/** List skills in a workspace. Auto-migrates flat `*.md` files first. */
export function listSkills(workspacePath: string): SkillSummary[] {
  const dir = skillsDir(workspacePath);
  if (!existsSync(dir)) return [];
  migrateFlatFiles(dir);
  const summaries: SkillSummary[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const skillMd = join(dir, ent.name, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    try {
      summaries.push(parseSkillContent(readFileSync(skillMd, "utf-8")).summary);
    } catch (e) {
      log.warn(`[skills] skipping ${ent.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  for (const s of summaries) ensureClaudeSymlink(workspacePath, s.name);
  summaries.sort((a, b) => a.name.localeCompare(b.name));
  return summaries;
}

/** Load a skill's full content. Stamps `last_used` like the Rust side. */
export function loadSkill(workspacePath: string, name: string): SkillDetail {
  const skillMd = join(skillsDir(workspacePath), name, "SKILL.md");
  if (!existsSync(skillMd)) throw skillNotFound(name);
  const { summary, body } = parseSkillContent(readFileSync(skillMd, "utf-8"));
  summary.lastUsed = todayIso();
  writeFileSync(skillMd, serializeSkill(summary, body));
  return { name: summary.name, description: summary.description, version: summary.version, content: body };
}

/** Create a new skill directory + SKILL.md, then emit `SkillsChanged`. */
export function createSkill(events: EventBus, req: CreateSkillRequest): void {
  validateName(req.name);
  validateDescription(req.description);
  validateContent(req.content);

  const dir = skillsDir(req.workspacePath);
  mkdirSync(dir, { recursive: true });
  const skillDir = join(dir, req.name);
  if (existsSync(skillDir)) throw alreadyExists(req.name);
  mkdirSync(skillDir, { recursive: true });

  const today = todayIso();
  const summary: SkillSummary = {
    name: req.name,
    description: req.description,
    version: 1,
    tags: [],
    created: today,
    lastUsed: today,
    category: null,
    featured: false,
    integrations: [],
    image: null,
    inputs: [],
    promptTemplate: null,
  };
  writeFileSync(join(skillDir, "SKILL.md"), serializeSkill(summary, req.content));
  ensureClaudeSymlink(req.workspacePath, req.name);
  emitSkillsChanged(events, req.workspacePath);
}

/** Full rewrite of a skill's body (keeps metadata, increments version). */
export function saveSkill(events: EventBus, name: string, req: SaveSkillRequest): void {
  validateContent(req.content);
  const skillMd = join(skillsDir(req.workspacePath), name, "SKILL.md");
  if (!existsSync(skillMd)) throw skillNotFound(name);
  const { summary } = parseSkillContent(readFileSync(skillMd, "utf-8"));
  summary.version += 1;
  summary.lastUsed = todayIso();
  writeFileSync(skillMd, serializeSkill(summary, req.content));
  emitSkillsChanged(events, req.workspacePath);
}

/** Delete a skill directory + its Claude symlink. Idempotent. */
export function deleteSkill(events: EventBus, workspacePath: string, name: string): void {
  const skillDir = join(skillsDir(workspacePath), name);
  if (existsSync(skillDir)) rmSync(skillDir, { recursive: true, force: true });
  removeClaudeSymlink(workspacePath, name);
  emitSkillsChanged(events, workspacePath);
}
