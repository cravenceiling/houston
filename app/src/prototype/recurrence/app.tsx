/**
 * PROTOTYPE — recurrence picker (issue #430). Throwaway. Not shipped.
 *
 * Hosts the four variants over ONE shared Recurrence model, behind a ?variant=
 * param. Switching variants keeps the schedule, so the user compares pure UI.
 * See ./NOTES.md for the question, the research, and the per-variant verdict.
 */
import { useState, type ComponentType } from "react"
import type { Recurrence } from "./cron"
import { DEFAULT_RECURRENCE } from "./cron"
import { Frame } from "./frame"
import { Switcher, type VariantMeta } from "./switcher"
import { VariantA } from "./variant-a"
import { VariantB } from "./variant-b"
import { VariantC } from "./variant-c"
import { VariantD } from "./variant-d"

type VariantProps = { rec: Recurrence; onChange: (p: Partial<Recurrence>) => void }

const VARIANTS: (VariantMeta & { reference: string; Component: ComponentType<VariantProps> })[] = [
  { key: "A", name: "Repeat-every builder", reference: "Google / Outlook", Component: VariantA },
  { key: "B", name: "Fill-in-the-sentence", reference: "Todoist spirit", Component: VariantB },
  { key: "C", name: "Grid-first", reference: "Apple / Notion", Component: VariantC },
  { key: "D", name: "Type-to-schedule", reference: "Todoist 2026", Component: VariantD },
]

function readVariant(): string {
  const key = new URLSearchParams(window.location.search).get("variant")?.toUpperCase()
  return VARIANTS.some((v) => v.key === key) ? (key as string) : "A"
}

export function PrototypeApp() {
  const [current, setCurrent] = useState(readVariant)
  const [rec, setRec] = useState<Recurrence>(DEFAULT_RECURRENCE)

  const onChange = (patch: Partial<Recurrence>) => setRec((prev) => ({ ...prev, ...patch }))

  const select = (key: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set("variant", key)
    window.history.replaceState(null, "", url)
    setCurrent(key)
  }

  const active = VARIANTS.find((v) => v.key === current) ?? VARIANTS[0]
  const Active = active.Component

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <Frame variantKey={active.key} variantName={active.name} reference={active.reference} rec={rec}>
        <Active rec={rec} onChange={onChange} />
      </Frame>
      <Switcher variants={VARIANTS} current={current} onSelect={select} />
    </div>
  )
}
