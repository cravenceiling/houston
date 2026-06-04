/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * Shared chrome so every variant is judged at the SAME density as the real
 * routine editor (ui/routines/src/routine-editor.tsx): white canvas, max-w-3xl,
 * a "When it runs" card. The frame owns everything *around* the picker — the
 * live summary, the next-run preview, and an honest feasibility badge — so the
 * variants differ only in how you *build* the schedule.
 */
import { useMemo, type ReactNode } from "react"
import { cn } from "@houston-ai/core"
import { CalendarClock, CheckCircle2, TriangleAlert } from "lucide-react"
import type { Recurrence } from "./cron"
import { toCron } from "./cron"
import { nextRuns } from "./next-runs"
import { summarize } from "./summary"
import { fmtDateTime } from "./format"

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-secondary px-5 py-5">
      <h3 className="mb-4 text-sm font-medium text-foreground">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function FeasibilityBadge({ rec }: { rec: Recurrence }) {
  const { cron, cronNative, caveats } = useMemo(() => toCron(rec), [rec])
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-xs",
        cronNative
          ? "border-[#00a240]/20 bg-[#00a240]/[0.06]"
          : "border-[#e0ac00]/25 bg-[#e0ac00]/[0.08]",
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        {cronNative ? (
          <CheckCircle2 className="size-4 text-[#00a240]" />
        ) : (
          <TriangleAlert className="size-4 text-[#b78a00]" />
        )}
        <span className="text-foreground">
          {cronNative ? "Fires exactly as shown — works with today's scheduler" : "Beyond cron — needs scheduler changes to fire exactly"}
        </span>
      </div>
      {caveats.length > 0 && (
        <ul className="mt-2 space-y-1 pl-6 text-muted-foreground">
          {caveats.map((c, i) => (
            <li key={i} className="list-disc">{c}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 pl-6 font-mono text-[11px] text-muted-foreground/70">cron: {cron || "—"}</p>
    </div>
  )
}

function NextRuns({ rec }: { rec: Recurrence }) {
  const runs = useMemo(() => nextRuns(rec, 3), [rec])
  return (
    <div className="flex items-start gap-3 rounded-lg border border-black/[0.04] bg-background px-4 py-3">
      <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{summarize(rec)}</p>
        {runs.length > 0 ? (
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            Next: {runs.map((d) => fmtDateTime(d)).join("  ·  ")}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground/70">Pick at least one day to see when it runs.</p>
        )}
      </div>
    </div>
  )
}

export function Frame({
  variantKey,
  variantName,
  reference,
  rec,
  children,
}: {
  variantKey: string
  variantName: string
  reference: string
  rec: Recurrence
  children: ReactNode
}) {
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Faux editor header — context only */}
      <header className="shrink-0 px-4 py-2.5">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="text-sm font-medium text-foreground">New routine</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            {variantKey} · {variantName} · ref: {reference}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-3 px-6 pb-24 pt-3">
          {/* Light hero for realistic density */}
          <section className="space-y-3 rounded-xl bg-secondary p-5">
            <input
              defaultValue="Morning standup"
              className="w-full rounded-lg border border-black/[0.04] bg-background px-3 py-2 text-sm text-foreground outline-none"
              placeholder="Routine name"
            />
            <textarea
              defaultValue="Summarize overnight messages and flag anything that needs me."
              rows={2}
              className="w-full resize-none rounded-lg border border-black/[0.04] bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none"
              placeholder="What should the agent do?"
            />
          </section>

          <SectionCard title="When it runs">
            {children}
            <NextRuns rec={rec} />
            <FeasibilityBadge rec={rec} />
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
