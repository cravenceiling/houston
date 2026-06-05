import { Hono } from "hono";
import { fetchCatalog, searchStore } from "@houston-ai/engine-core";
import { ApiError } from "../errors.ts";

/**
 * `/v1/store/*` + the GitHub-install actions — mirrors the full surface of
 * `routes/store.rs`. Catalog + search are live reads; the install / update
 * actions fetch from GitHub into the local agents dir and land with the store
 * milestone, so they answer with an honest UNAVAILABLE rather than a bare 404.
 * (`/store/imports/*` + `/agents/portable/*` belong to the portable-agent
 * module, not store.rs, and stay with the portable milestone.)
 */
export function storeRoutes(): Hono {
  const r = new Hono();
  r.get("/store/catalog", async (c) => c.json(await fetchCatalog()));
  r.get("/store/search", async (c) => {
    // Match axum's required `SearchQuery { q }`: an absent param is a 400; a
    // present-but-empty `?q=` is a real empty search and passes through.
    const q = c.req.query("q");
    if (q === undefined) throw ApiError.badRequest("missing query parameter q");
    return c.json(await searchStore(q));
  });

  const notYet = () => {
    throw new ApiError("UNAVAILABLE", "Installing from the store isn't available on this engine yet.");
  };
  r.post("/store/installs", notYet);
  r.delete("/store/installs/:id", notYet);
  r.post("/agents/install-from-github", notYet);
  r.post("/agents/check-updates", notYet);
  r.post("/workspaces/install-from-github", notYet);

  return r;
}
