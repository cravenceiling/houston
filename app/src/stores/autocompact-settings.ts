import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Autocompact settings — a client-side UI behavior preference, persisted to
 * localStorage. Kept out of the engine `preferences` table on purpose: it
 * governs how the desktop client drives sessions, reads synchronously at send
 * time (see `lib/autocompact.ts`), and doesn't need cross-device sync.
 *
 * When enabled (default), once a conversation's context fill reaches
 * `threshold` percent the next turn runs on a freshly-compacted session. The
 * threshold sits just below the provider CLIs' own ~95% auto-compaction so
 * Houston compacts cleanly at a turn boundary first.
 */
export const DEFAULT_AUTOCOMPACT_THRESHOLD = 93;
export const MIN_AUTOCOMPACT_THRESHOLD = 50;
export const MAX_AUTOCOMPACT_THRESHOLD = 99;

interface AutocompactSettings {
  enabled: boolean;
  /** Percent-full at which to compact (clamped to [50, 99]). */
  threshold: number;
  setEnabled: (enabled: boolean) => void;
  setThreshold: (threshold: number) => void;
}

const clampThreshold = (n: number): number =>
  Math.min(
    MAX_AUTOCOMPACT_THRESHOLD,
    Math.max(MIN_AUTOCOMPACT_THRESHOLD, Math.round(n)),
  );

export const useAutocompactSettings = create<AutocompactSettings>()(
  persist(
    (set) => ({
      enabled: true,
      threshold: DEFAULT_AUTOCOMPACT_THRESHOLD,
      setEnabled: (enabled) => set({ enabled }),
      setThreshold: (threshold) => set({ threshold: clampThreshold(threshold) }),
    }),
    { name: "houston.autocompact" },
  ),
);
