// =============================================================================
// provision-tenant — Supabase Edge Function (Deno).
//
// Triggered by the authenticated mobile webapp right after signup:
//   await supabase.functions.invoke("provision-tenant")
//
// Responsibilities:
//   1. Verify the caller's JWT and resolve their user_id.
//   2. Create Namespace + Secret + Deployment + Service in K8s via REST.
//      (See ./k8s.ts — Supabase Edge runtime has no kubectl/helm.)
//   3. Write engine_url + engine_token back into public.tenants so the
//      mobile Realtime subscription wakes up with the connection details.
//
// Same file deploys to production unchanged. Only env vars differ:
// locally K8S_API_URL points at kind on 127.0.0.1; in prod it points
// at the GKE control plane via Workload Identity.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  createEngineDeployment,
  createEngineService,
  createNamespace,
  createTokenSecret,
} from "./k8s.ts";

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The webapp lives on http://127.0.0.1:1420 and POSTs cross-origin to
// this function on :8000 — browsers preflight with OPTIONS first, so we
// must respond to it and tag every reply with the right CORS headers.
// In production the function is same-origin with the supabase project
// host and CORS never trips, but locally it matters.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "POST required" }, 405);
  }

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "missing bearer token" }, 401);

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: "invalid token", detail: userErr?.message }, 401);
  }
  const user = userData.user;
  const namespace = `tenant-${shortId(user.id)}`;
  const engineToken = randomToken();

  try {
    await ensureTenantRow(user.id);
    await createNamespace(namespace);
    // createTokenSecret is idempotent and returns the EFFECTIVE token —
    // either the one we just wrote (fresh tenant) or the one that was
    // already in K8s (re-invocation race). Always use this value for the
    // tenants row so the webapp's bearer matches the pod's mounted env.
    const effectiveToken = await createTokenSecret(namespace, engineToken);
    await createEngineDeployment(namespace);
    await createEngineService(namespace);

    // engine_url is the laptop-side port-forward target for now (Chunk 4).
    // Multi-tenant Ingress lands in a later chunk; engine_url then becomes
    // something like `http://localhost/<namespace>/`.
    const engineUrl = "http://localhost:7777";

    await admin.from("tenants").update({
      namespace,
      engine_url: engineUrl,
      engine_token: effectiveToken,
      status: "ready",
      error: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    return json({ namespace, engine_url: engineUrl }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("tenants").update({
      status: "failed",
      error: msg,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
    return json({ error: msg }, 500);
  }
});

async function ensureTenantRow(userId: string): Promise<void> {
  const { error } = await admin.from("tenants").upsert({
    user_id: userId,
    status: "pending",
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`tenants upsert: ${error.message}`);
}

function mustEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

function shortId(uuid: string): string {
  return uuid.replace(/-/g, "").slice(0, 12);
}

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
