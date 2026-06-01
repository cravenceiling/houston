import { Hono } from "hono";
import {
  type EngineState,
  createSkill,
  deleteSkill,
  listSkills,
  loadSkill,
  saveSkill,
} from "@houston-ai/engine-core";
import {
  createSkillSchema,
  saveSkillSchema,
  skillsWorkspaceQuerySchema,
} from "@houston-ai/engine-protocol";
import { ApiError } from "../errors.ts";
import { empty } from "../http.ts";

/**
 * `/v1/skills` — local skills CRUD. Mirrors `routes/skills.rs` for the local
 * surface (list/load/create/save/delete); each mutation emits `SkillsChanged`,
 * which flips the onboarding "Skill" mission to done. `workspacePath` is the
 * agent's on-disk root, passed as a query param on GET/DELETE and in the body
 * on POST/PUT (matching the wire).
 *
 * Community (skills.sh) + repo (GitHub) install land with the remote milestone;
 * those routes return UNAVAILABLE with a clear message rather than a bare 404.
 */
export function skillRoutes(engine: EngineState): Hono {
  const r = new Hono();

  const workspacePath = (c: { req: { query(k: string): string | undefined } }): string =>
    skillsWorkspaceQuerySchema.parse({ workspacePath: c.req.query("workspacePath") }).workspacePath;

  r.get("/skills", (c) => c.json(listSkills(workspacePath(c))));
  r.get("/skills/:name", (c) => c.json(loadSkill(workspacePath(c), c.req.param("name"))));

  r.post("/skills", async (c) => {
    const body = createSkillSchema.parse(await c.req.json());
    createSkill(engine.events, body);
    return empty();
  });

  r.put("/skills/:name", async (c) => {
    const body = saveSkillSchema.parse(await c.req.json());
    saveSkill(engine.events, c.req.param("name"), body);
    return empty();
  });

  r.delete("/skills/:name", (c) => {
    deleteSkill(engine.events, workspacePath(c), c.req.param("name"));
    return empty();
  });

  const notYet = () => {
    throw new ApiError(
      "UNAVAILABLE",
      "Skill marketplace search and install aren't available on this engine yet.",
    );
  };
  r.post("/skills/community/search", notYet);
  r.post("/skills/community/popular", notYet);
  r.post("/skills/community/install", notYet);
  r.post("/skills/repo/list", notYet);
  r.post("/skills/repo/install", notYet);

  return r;
}
