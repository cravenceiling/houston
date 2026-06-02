/**
 * Decide whether a given send should ask the engine to compact first.
 *
 * Centralized here (and called from `tauriChat.send`) so EVERY send path —
 * board chat, mission control, skill sends, retries — gets autocompact for
 * free, rather than each call site re-deriving the flag and one being missed.
 *
 * Reads the live feed store + the user's autocompact settings synchronously
 * (both are Zustand stores). New conversations have no reported usage yet, so
 * this returns `false` and the engine runs a normal first turn.
 */
import { useFeedStore } from "../stores/feeds";
import { useAutocompactSettings } from "../stores/autocompact-settings";
import { getContextWindowConfig } from "./providers";
import {
  contextFillPercent,
  effectiveContextWindow,
  sessionContextUsage,
  shouldAutocompact,
} from "./context-usage";

export function shouldAutocompactForSession(
  agentPath: string,
  sessionKey: string,
  provider: string | undefined,
  model: string | undefined,
): boolean {
  const { enabled, threshold } = useAutocompactSettings.getState();
  if (!enabled) return false;

  const items = useFeedStore.getState().items[agentPath]?.[sessionKey];
  const { latest, peakContextTokens } = sessionContextUsage(items);
  const cfg = getContextWindowConfig(provider, model);
  const window = effectiveContextWindow(cfg, peakContextTokens);
  const percent = contextFillPercent(latest, window);

  return shouldAutocompact({ percent, enabled, threshold });
}
