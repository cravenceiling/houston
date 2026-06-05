/**
 * Houston agent store — catalog + search reads.
 *
 * Port of the read surface of `houston-engine-core/src/store.rs`. Talks to the
 * remote store API (`HOUSTON_STORE_API` or the default). Install / update flows
 * (which fetch from GitHub into the local agents dir) land with a later
 * milestone. The TS engine ships no bundled catalog, so we always hit the API.
 */

import type { StoreListing } from "@houston-ai/engine-protocol";
import { CoreError } from "./error.ts";

const STORE_API_DEFAULT = "https://store.gethouston.ai/api";

function storeApi(): string {
  return process.env.HOUSTON_STORE_API ?? STORE_API_DEFAULT;
}

interface CatalogResponse {
  agents: StoreListing[];
}

async function fetchListings(url: string): Promise<StoreListing[]> {
  // Failures map to INTERNAL (HTTP 500), matching the Rust `CoreError::Internal`
  // taxonomy for `store::{fetch_catalog,search}` — a client matching on
  // error.code / status must see the same value the Rust engine produces.
  let resp: Response;
  try {
    resp = await fetch(url);
  } catch (e) {
    throw CoreError.internal(`network: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!resp.ok) {
    throw CoreError.internal(`store request returned ${resp.status}`);
  }
  let body: CatalogResponse;
  try {
    body = (await resp.json()) as CatalogResponse;
  } catch (e) {
    throw CoreError.internal(`store response parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  // A malformed response (no `agents` array) is a broken backend, NOT an empty
  // catalog — surface it instead of silently rendering "no agents available"
  // (Rust's `CatalogResponse` has no serde default, so the same body errors).
  if (!Array.isArray(body.agents)) {
    throw CoreError.internal("store response missing 'agents' array");
  }
  return body.agents;
}

/** Fetch the full agent catalog. */
export function fetchCatalog(): Promise<StoreListing[]> {
  return fetchListings(`${storeApi()}/catalog`);
}

/** Search the catalog (server-side query). */
export function searchStore(query: string): Promise<StoreListing[]> {
  return fetchListings(`${storeApi()}/search?q=${encodeURIComponent(query)}`);
}
