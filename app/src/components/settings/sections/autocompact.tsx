import { useTranslation } from "react-i18next";
import {
  useAutocompactSettings,
  MIN_AUTOCOMPACT_THRESHOLD,
  MAX_AUTOCOMPACT_THRESHOLD,
} from "../../../stores/autocompact-settings";

/**
 * Autocompact settings. When on, Houston summarizes a conversation and
 * continues on a fresh session once its context reaches the chosen fullness,
 * so long chats keep working. The user still sees the full history.
 */
export function AutocompactSection() {
  const { t } = useTranslation("settings");
  const enabled = useAutocompactSettings((s) => s.enabled);
  const threshold = useAutocompactSettings((s) => s.threshold);
  const setEnabled = useAutocompactSettings((s) => s.setEnabled);
  const setThreshold = useAutocompactSettings((s) => s.setThreshold);

  const pill = (selected: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition-colors ${
      selected
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-foreground hover:bg-accent"
    }`;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{t("autocompact.title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t("autocompact.description")}
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setEnabled(true)} className={pill(enabled)}>
          {t("autocompact.on")}
        </button>
        <button
          type="button"
          onClick={() => setEnabled(false)}
          className={pill(!enabled)}
        >
          {t("autocompact.off")}
        </button>
      </div>
      {enabled && (
        <div className="mt-4 flex items-center gap-3 text-sm max-w-sm">
          <span className="text-muted-foreground whitespace-nowrap">
            {t("autocompact.thresholdLabel")}
          </span>
          <input
            type="range"
            min={MIN_AUTOCOMPACT_THRESHOLD}
            max={MAX_AUTOCOMPACT_THRESHOLD}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="flex-1 accent-primary"
            aria-label={t("autocompact.thresholdLabel")}
          />
          <span className="tabular-nums w-10 text-right">{threshold}%</span>
        </div>
      )}
    </section>
  );
}
