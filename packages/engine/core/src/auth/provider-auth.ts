/**
 * Provider OAuth login (Claude Pro/Max + ChatGPT Codex), via pi-ai `./oauth`.
 *
 * Reproduces the Rust headless provider-login wire flow
 * (`routes/providers.rs` + `provider::launch_login`) using pi-ai's OAuth
 * providers, which each run their own localhost callback server — the exact
 * "open the link, approve in the browser" loopback the desktop uses:
 *
 *   POST /v1/providers/:name/login
 *     -> provider.login(callbacks): starts the callback server, returns the
 *        authorize URL via onAuth -> we emit `ProviderLoginUrl`. The user
 *        approves in the browser; the provider redirects to localhost; login()
 *        resolves -> we persist credentials + emit `ProviderLoginComplete`.
 *   POST /v1/providers/:name/login/code   -> resolves the paste-back prompt
 *        (remote/headless engines that can't receive the localhost callback).
 *   POST /v1/providers/:name/login/cancel -> aborts the in-flight login.
 *   POST /v1/providers/:name/logout       -> drops stored credentials.
 *
 * Using the OAuth access token in actual model requests (Anthropic's oauth
 * Bearer + beta header, the Codex responses base URL) is the API-wiring
 * follow-up; this lands the login + status + storage surface.
 */

import {
  type OAuthCredentials,
  type OAuthLoginCallbacks,
  getOAuthProvider,
} from "@earendil-works/pi-ai/oauth";
import { Event, type ProviderStatus } from "@houston-ai/engine-protocol";
import type { EventBus } from "../events.ts";
import { CoreError } from "../error.ts";
import { log } from "../log.ts";
import { OAuthStore } from "./oauth-store.ts";

/** Houston provider name -> pi OAuth provider id. */
const OAUTH_ID: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai-codex",
};

const CLI_NAME: Record<string, string> = {
  anthropic: "claude",
  openai: "codex",
  gemini: "gemini",
};

interface Pending {
  abort: AbortController;
  resolveCode: (code: string) => void;
  rejectCode: (err: Error) => void;
}

export class ProviderAuth {
  private readonly store: OAuthStore;
  private readonly events: EventBus;
  private readonly pending = new Map<string, Pending>();

  constructor(homeDir: string, events: EventBus) {
    this.store = new OAuthStore(homeDir);
    this.events = events;
  }

  private oauthId(houstonName: string): string {
    const id = OAUTH_ID[houstonName];
    if (!id) throw CoreError.badRequest(`provider "${houstonName}" has no OAuth login flow`);
    return id;
  }

  /** Provider auth + readiness for `GET /v1/providers/:name/status`. */
  status(houstonName: string): ProviderStatus {
    const id = OAUTH_ID[houstonName];
    const authed = id ? this.store.has(id) : false;
    return {
      provider: houstonName,
      // The TS engine runs the loop in-process, so there is no provider CLI to
      // install — report installed so the app skips its "install Claude" path.
      cliInstalled: true,
      authState: authed ? "authenticated" : "unauthenticated",
      cliName: CLI_NAME[houstonName] ?? houstonName,
      installSource: "managed",
      cliPath: null,
    };
  }

  /** Stored access token for a logged-in provider (for the session runtime). */
  accessToken(houstonName: string): string | undefined {
    const id = OAUTH_ID[houstonName];
    return id ? this.store.get(id)?.access : undefined;
  }

  /** Launch the browser-approve login flow. Returns immediately; progress and
   *  completion arrive on the `providers` WS topic. */
  startLogin(houstonName: string, deviceAuth: boolean): void {
    const id = this.oauthId(houstonName);
    const provider = getOAuthProvider(id);
    if (!provider) throw CoreError.badRequest(`no OAuth provider registered for "${houstonName}"`);
    if (this.pending.has(id)) {
      throw CoreError.conflict(`a login for "${houstonName}" is already pending; cancel it first`);
    }

    const abort = new AbortController();
    let resolveCode!: (code: string) => void;
    let rejectCode!: (err: Error) => void;
    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });
    codePromise.catch(() => {}); // a cancel rejects this; don't surface as unhandled
    this.pending.set(id, { abort, resolveCode, rejectCode });

    const callbacks: OAuthLoginCallbacks = {
      onAuth: (info) => this.events.emit(Event.providerLoginUrl(houstonName, info.url, null)),
      onDeviceCode: (info) =>
        this.events.emit(Event.providerLoginUrl(houstonName, info.verificationUri, info.userCode)),
      onPrompt: async () => codePromise,
      onManualCodeInput: async () => codePromise,
      onProgress: () => {},
      onSelect: async (prompt) => {
        if (deviceAuth) {
          const device = prompt.options.find((o) => /device/i.test(o.id))?.id;
          if (device) return device;
        }
        return prompt.options[0]?.id; // browser loopback (desktop default)
      },
      signal: abort.signal,
    };

    void provider
      .login(callbacks)
      .then((creds: OAuthCredentials) => {
        this.store.set(id, creds);
        this.events.emit(Event.providerLoginComplete(houstonName, true, null));
        log.info(`[oauth] ${houstonName} login complete`);
      })
      .catch((err: unknown) => {
        const aborted = abort.signal.aborted;
        const message = aborted ? null : err instanceof Error ? err.message : String(err);
        this.events.emit(Event.providerLoginComplete(houstonName, false, message));
        if (!aborted) log.warn(`[oauth] ${houstonName} login failed:`, err);
      })
      .finally(() => {
        if (this.pending.get(id)?.abort === abort) this.pending.delete(id);
      });
  }

  /** Submit the verification code the user pasted (remote/headless paste-back). */
  submitCode(houstonName: string, code: string): void {
    const id = this.oauthId(houstonName);
    const pending = this.pending.get(id);
    if (!pending) throw CoreError.badRequest("no login in progress for this provider");
    pending.resolveCode(code);
  }

  /** Abort an in-flight login. Idempotent; emits a benign completion. */
  cancelLogin(houstonName: string): void {
    const id = OAUTH_ID[houstonName];
    if (!id) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    pending.abort.abort();
    pending.rejectCode(new Error("Login cancelled"));
  }

  logout(houstonName: string): void {
    this.store.remove(this.oauthId(houstonName));
  }
}
