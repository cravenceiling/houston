# Recurrence picker — prototype notes (issue #430)

> **Status: THROWAWAY.** Dev-only design exploration. Not shipped (`vite build`
> only inputs `index.html`, so `prototype.html` never ends up in a release).
> When a variant wins, its logic is **rewritten properly into
> `ui/routines/src/`** with tests — these files get deleted.

## The question

Houston routines have a "custom" schedule that today is a single
"every N [minutes/hours/days]" input (`ui/routines/src/schedule-picker-fields.tsx`).
It can't express the thing people actually want — *"every Mon / Wed / Fri"*,
*"the 2nd Tuesday"*, *"weekdays at 9am"*. **What should the richer recurrence
picker look like**, for a non-technical user who must never see cron?

Four structurally different answers, switchable from the floating bottom bar
(or `?variant=A|B|C|D`), all editing **one shared recurrence model** so you
compare pure UI.

## How to run

```bash
cd app
pnpm install      # only if this branch is a fresh checkout
pnpm dev          # vite dev server on http://localhost:1420
```

Open **http://localhost:1420/prototype.html**. No engine, no Tauri, no
workspace needed — it bypasses the app's EngineGate. Flip variants with the
bottom bar or ← / → arrow keys.

## The four variants

| Key | Name | Primary affordance | Reference app | File |
|----|------|--------------------|---------------|------|
| **A** | Repeat-every builder | stacked form: "every N [unit]" + conditional reveals | Google Calendar / Outlook | `variant-a.tsx` |
| **B** | Fill-in-the-sentence | one editable sentence; tap underlined tokens → popovers | Todoist spirit / Houston-native | `variant-b.tsx` |
| **C** | Grid-first | big cadence switch + tap a visual weekday strip / month grid; time as hero | Apple Calendar / Notion | `variant-c.tsx` |
| **D** | Type-to-schedule | natural-language box → live parse → reflected into the model | Todoist 2026 | `variant-d.tsx` |

Each variant sits inside the same `Frame` (`frame.tsx`) that mirrors the real
routine editor's "When it runs" card and shows, for every variant:

- the **plain-English summary** ("Runs every week on Mon, Wed and Fri at 9:00 AM"),
- a **next-3-runs preview** (crontab.guru's trust pattern), and
- an honest **feasibility badge** (green = fires exactly on today's scheduler,
  amber = needs scheduler work) + the generated cron for reference.

## Cross-cutting decisions (baked into all variants)

Pulled from cross-app research (Google, Apple, Notion, Todoist, Outlook,
crontab.guru / GH Actions / Vercel):

- **Seven-pill `S M T W T F S` weekday toggle** — the one universal control.
- **Multi-day weekly** (`Mon, Wed, Fri`) — the headline new capability. Maps to
  a cron day-of-week list (`0 9 * * 1,3,5`), which the engine already supports
  (`engine/houston-engine-core/src/routines/cron_compat.rs` shifts each item).
- **Dual monthly choice**: "on the 15th" vs "on the 2nd Tuesday".
- **Force monthly-by-date XOR weekly-by-day** so we never emit an ambiguous
  cron with both day-of-month and day-of-week set.
- **Time-of-day is first-class** (calendar apps bury it; a scheduler shouldn't).
- **Live summary + next-runs preview** everywhere.

## Feasibility — what cron can and can't do

The backend stores routines as a **5-field cron string**, which is infinite and
stateless. The prototype is honest about the gap (amber badge + `toCron`
caveats in `cron.ts`):

**✅ Cron-native today (ship with no backend change):**
every N minutes/hours/days · specific weekday(s) · "every weekday"/"weekends" ·
fixed day-of-month · specific month + day (yearly) · time-of-day.

**⚠️ Needs scheduler work (an anchor date + counter, or an RRULE-style model):**
- **"Every N weeks / months / years"** (N > 1) — cron `*/N` on weekday/dom does
  *not* mean "every other week".
- **"On the Nth weekday"** ("2nd Tuesday", "last Friday") — no POSIX cron operator.
- **End conditions** — "until <date>" and "after N runs" — cron never stops.

The variants still *show* these options (with the amber flag) so the choice of
UI is decoupled from the choice of how far to extend the backend. Whichever
variant wins, we decide separately whether to (a) restrict it to the cron-native
subset for v1, or (b) add the sibling fields / RRULE model to `routines.json`.

## Research sources

Google Calendar Help · Apple Support (repeating events) · Notion (repeating DB
templates) · Todoist Help (recurring dates + the 2026 visual builder) · Microsoft
Graph (recurrencePattern + recurrenceRange) · crontab.guru / GitHub Actions /
Vercel Cron docs. Full per-app breakdown captured in the PR description.

## Verdict

_(to be filled once the user picks)_

- **Chosen variant:** …
- **Steal from others:** …  (e.g. "A's form with B's summary sentence")
- **Backend scope for v1:** cron-native only / + every-N-weeks / + ordinal / + end-dates
- **Next step:** rewrite the winner into `ui/routines/src/` with tests
  (extend `ui/routines/tests/schedule-cron-utils.test.ts`), delete this folder
  + `app/prototype.html`.
