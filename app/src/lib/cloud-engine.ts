/**
 * Cloud engine state — sandbox-only, opt-in via VITE_HOUSTON_CLOUD_MODE=1.
 *
 * Owns module-scoped "we've already wired this user" flags that <CloudGate>
 * uses to avoid splash-on-tab-refocus regressions. Why module state and
 * not React refs: a useRef resets every time React remounts the component
 * (HMR, parent re-render, dev-tools tinkering). Module state survives all
 * of that — only an explicit sign-out clears it.
 *
 * Network ops live in ./cloud-engine-net.ts; cache helpers in
 * ./cloud-engine-cache.ts.
 *
 * NOT i18n-enabled — sandbox feature. Add t() before this surfaces in any
 * shipping build.
 */

import { isEngineReady, setCloudEngineConfig } from "./engine";
import { clearCache, readCache, writeCache } from "./cloud-engine-cache";
import {
  fetchTenantConfig,
  markTenantActive,
  provisionTenant,
  waitForEngineHealthy,
  type TenantConfig,
} from "./cloud-engine-net";

export type { TenantConfig } from "./cloud-engine-net";

export function isCloudModeEnabled(): boolean {
  return (import.meta as any).env?.VITE_HOUSTON_CLOUD_MODE === "1";
}

let _provisionedUserId: string | null = null;
// True once <CloudGate> has rendered children at least once. After this
// point, CloudGate keeps rendering children no matter what — incidental
// auth events or React decisions can't unmount App and lose dialog state.
let _hasMountedChildren = false;

export function getProvisionedUserId(): string | null {
  return _provisionedUserId;
}

export function markProvisioned(userId: string, config: TenantConfig): void {
  setCloudEngineConfig(config);
  _provisionedUserId = userId;
  writeCache({ userId, baseUrl: config.baseUrl, token: config.token });
}

export function clearProvisioned(): void {
  _provisionedUserId = null;
  clearCache();
}

export function isProvisionedFor(userId: string): boolean {
  return _provisionedUserId === userId && isEngineReady();
}

export function markChildrenMounted(): void {
  _hasMountedChildren = true;
}

export function haveChildrenMounted(): boolean {
  return _hasMountedChildren;
}

export function resetMountedChildren(): void {
  _hasMountedChildren = false;
}

// Re-export net helpers so callers don't have to know about the split.
export { fetchTenantConfig, provisionTenant } from "./cloud-engine-net";

// Module-load warm-up: pull cached config out of localStorage and install
// it on the engine singleton BEFORE React mounts. This stops EngineGate
// from flashing its "Starting Houston engine" splash on page reload for
// users who've already provisioned in a previous session.
if (isCloudModeEnabled()) {
  const cached = readCache();
  if (cached) {
    setCloudEngineConfig({ baseUrl: cached.baseUrl, token: cached.token });
    _provisionedUserId = cached.userId;
  }
}

// Concurrency guard: bootstrap() and onAuthStateChange's SIGNED_IN can
// both fire ensureProvisioned in parallel during the first sign-in.
// Without this, both would call provisionTenant, the second call's
// generated token would land in the tenants row while the K8s secret
// kept the first call's token (409 swallowed) — and every webapp
// request would 401 because of the mismatch.
let _provisionInFlight: Promise<void> | null = null;

/**
 * Idempotent provisioning entry point used by both the CloudGate effect
 * AND the CloudLoginScreen onSignedIn callback. Crucially:
 *  - Concurrent callers share one in-flight Promise (no duplicate POSTs).
 *  - The engine singleton holds the new token BEFORE this resolves.
 *  - The localStorage cache is only written AFTER /v1/health passes —
 *    so a half-failed provision can't poison the next page reload.
 */
export async function ensureProvisioned(userId: string): Promise<void> {
  if (isProvisionedFor(userId)) return;
  if (_provisionInFlight) return _provisionInFlight;

  _provisionInFlight = (async () => {
    try {
      const prev = getProvisionedUserId();
      if (prev && prev !== userId) {
        clearProvisioned();
        resetMountedChildren();
      }

      let config = await fetchTenantConfig();
      if (!config) {
        await provisionTenant();
        config = await fetchTenantConfig();
      }
      if (!config) {
        throw new Error(
          "provision-tenant returned but no ready row appeared in `tenants`",
        );
      }
      // Wire engine + module state so other code paths see "ready", but
      // delay cache persistence until we know /v1/health actually answers.
      setCloudEngineConfig(config);
      _provisionedUserId = userId;
      // Tell the local PF watcher which tenant we want on :7777. The
      // watcher polls Supabase by `updated_at desc`, so bumping it elects
      // this tenant ahead of the next watcher tick (≤5s). Done before
      // the health probe so its retry budget covers the PF flip.
      await markTenantActive();
      await waitForEngineHealthy(config);
      // Health confirmed — safe to commit to cache for next page load.
      writeCache({ userId, baseUrl: config.baseUrl, token: config.token });
    } finally {
      _provisionInFlight = null;
    }
  })();
  return _provisionInFlight;
}
