import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  makeSplitTransportSend,
  makeSplitTransportFlush,
  resolveCapturedEventId,
} from "../src/lib/sentry-transport.ts";

// The split transport is load-bearing: replay envelopes MUST go to the direct
// HTTP (fetch) transport because the Rust IPC SDK drops them, and the combined
// flush MUST require BOTH queues to drain or the "report sent" toast would lie.
// These pure helpers let us pin that routing down without standing up
// @sentry/browser.

describe("makeSplitTransportSend", () => {
  it("routes replay envelopes to fetch, everything else to ipc", () => {
    const calls: string[] = [];
    const ipc = {
      send: (e: string): string => {
        calls.push(`ipc:${e}`);
        return `ipc:${e}`;
      },
    };
    const fetch = {
      send: (e: string): string => {
        calls.push(`fetch:${e}`);
        return `fetch:${e}`;
      },
    };
    const isReplay = (e: string): boolean => e === "replay";

    const send = makeSplitTransportSend(ipc, fetch, isReplay);

    assert.equal(send("replay"), "fetch:replay");
    assert.equal(send("event"), "ipc:event");
    // Each envelope hit exactly one transport, in order.
    assert.deepEqual(calls, ["fetch:replay", "ipc:event"]);
  });

  it("never calls the transport it did not route to", () => {
    let ipcCalls = 0;
    let fetchCalls = 0;
    const ipc = {
      send: (_e: string): string => {
        ipcCalls += 1;
        return "ipc";
      },
    };
    const fetch = {
      send: (_e: string): string => {
        fetchCalls += 1;
        return "fetch";
      },
    };

    const send = makeSplitTransportSend(ipc, fetch, () => true);
    send("x");

    assert.equal(fetchCalls, 1);
    assert.equal(ipcCalls, 0);
  });
});

describe("makeSplitTransportFlush", () => {
  it("resolves true only when BOTH transports flush true", async () => {
    const t = (ok: boolean) => ({ flush: async (): Promise<boolean> => ok });

    assert.equal(await makeSplitTransportFlush(t(true), t(true))(1), true);
    assert.equal(await makeSplitTransportFlush(t(true), t(false))(1), false);
    assert.equal(await makeSplitTransportFlush(t(false), t(true))(1), false);
    assert.equal(await makeSplitTransportFlush(t(false), t(false))(1), false);
  });

  it("passes the timeout through to both transports", async () => {
    const seen: Array<number | undefined> = [];
    const t = {
      flush: async (timeout?: number): Promise<boolean> => {
        seen.push(timeout);
        return true;
      },
    };

    await makeSplitTransportFlush(t, t)(5000);
    assert.deepEqual(seen, [5000, 5000]);
  });
});

describe("resolveCapturedEventId", () => {
  it("returns the event id when the transport flushed", () => {
    assert.equal(resolveCapturedEventId("9c2a1f0011223344", true), "9c2a1f0011223344");
  });

  it("returns empty string when the flush failed (no false 'report sent')", () => {
    assert.equal(resolveCapturedEventId("9c2a1f0011223344", false), "");
  });
});
