/**
 * Built-in agent tools: read / write / edit / bash.
 *
 * Clean `AgentTool` implementations (the pi `coding-agent` versions are coupled
 * to its TUI). Each tool is scoped to the session working directory; bash runs
 * commands there. Tools throw on failure — the agent loop turns thrown errors
 * into tool-result errors, which the feed maps to `tool_result { is_error }`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";

const MAX_OUTPUT = 30_000;

function resolveIn(cwd: string, p: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}

function textResult(text: string, details: unknown = {}): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details };
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n[...truncated ${s.length - MAX_OUTPUT} chars]` : s;
}

const readSchema = Type.Object({
  path: Type.String({ description: "File path (relative to the working directory or absolute)." }),
  offset: Type.Optional(Type.Number({ description: "1-indexed line to start from." })),
  limit: Type.Optional(Type.Number({ description: "Max lines to read." })),
});

const writeSchema = Type.Object({
  path: Type.String({ description: "File path to write (relative or absolute)." }),
  content: Type.String({ description: "Full file contents." }),
});

const editSchema = Type.Object({
  path: Type.String({ description: "File to edit." }),
  old_string: Type.String({ description: "Exact text to replace." }),
  new_string: Type.String({ description: "Replacement text." }),
  replace_all: Type.Optional(Type.Boolean({ description: "Replace every occurrence (default first)." })),
});

const bashSchema = Type.Object({
  command: Type.String({ description: "Shell command to run in the working directory." }),
});

export function createTools(cwd: string): AgentTool<any>[] {
  const read: AgentTool<typeof readSchema> = {
    name: "read",
    label: "read",
    description: "Read the contents of a text file.",
    parameters: readSchema,
    async execute(_id, { path, offset, limit }) {
      const full = resolveIn(cwd, path);
      if (!existsSync(full)) throw new Error(`File not found: ${path}`);
      const lines = readFileSync(full, "utf-8").split("\n");
      const start = offset ? Math.max(0, offset - 1) : 0;
      const end = limit !== undefined ? start + limit : lines.length;
      return textResult(lines.slice(start, end).join("\n"));
    },
  };

  const write: AgentTool<typeof writeSchema> = {
    name: "write",
    label: "write",
    description: "Write a file, creating parent directories as needed. Overwrites if it exists.",
    parameters: writeSchema,
    async execute(_id, { path, content }) {
      const full = resolveIn(cwd, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
      return textResult(`Wrote ${Buffer.byteLength(content)} bytes to ${path}`, { path });
    },
  };

  const edit: AgentTool<typeof editSchema> = {
    name: "edit",
    label: "edit",
    description: "Replace text in a file. Fails if old_string is not present.",
    parameters: editSchema,
    async execute(_id, { path, old_string, new_string, replace_all }) {
      const full = resolveIn(cwd, path);
      if (!existsSync(full)) throw new Error(`File not found: ${path}`);
      const original = readFileSync(full, "utf-8");
      if (!original.includes(old_string)) throw new Error(`old_string not found in ${path}`);
      const updated = replace_all
        ? original.split(old_string).join(new_string)
        : original.replace(old_string, new_string);
      writeFileSync(full, updated);
      return textResult(`Edited ${path}`, { path });
    },
  };

  const bash: AgentTool<typeof bashSchema> = {
    name: "bash",
    label: "bash",
    description: "Run a shell command in the working directory and return its output.",
    parameters: bashSchema,
    async execute(_id, { command }) {
      const proc = Bun.spawnSync(["bash", "-lc", command], { cwd, stdout: "pipe", stderr: "pipe" });
      const decoder = new TextDecoder();
      const stdout = decoder.decode(proc.stdout);
      const stderr = decoder.decode(proc.stderr);
      const combined = `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`.trim();
      if (proc.exitCode !== 0) {
        throw new Error(`Command exited with code ${proc.exitCode}:\n${truncate(combined)}`);
      }
      return textResult(truncate(combined) || "(no output)", { exitCode: proc.exitCode });
    },
  };

  return [read, write, edit, bash];
}
