/**
 * Mobile tunnel — read-only status stub.
 *
 * The tunnel runtime (relay allocation, pairing, device tokens) is a later
 * milestone. `tunnelStatus` returns the disconnected default, mirroring the
 * `st.tunnel_runtime = None` branch of `routes/tunnel.rs`, so the "connect a
 * phone" surface shows a calm disconnected state instead of erroring on boot.
 */

import type { TunnelStatus } from "@houston-ai/engine-protocol";

export function tunnelStatus(): TunnelStatus {
  return { connected: false, tunnelId: null, publicHost: null, lastActivityMs: null };
}
