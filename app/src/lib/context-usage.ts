import type { FeedItem, TokenUsage } from "@houston-ai/chat";

/**
 * The most recent turn's token usage in a session's feed, or `null` when no
 * completed turn has reported usage yet (a fresh conversation, or a provider
 * that doesn't surface usage). Scans from the end so the result reflects the
 * current state of the context window, and survives a history reload because
 * `final_result` items are persisted and replayed into the feed store.
 */
export function latestContextUsage(
  items: FeedItem[] | undefined,
): TokenUsage | null {
  if (!items) return null;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item.feed_type === "final_result" && item.data.usage) {
      return item.data.usage;
    }
  }
  return null;
}
