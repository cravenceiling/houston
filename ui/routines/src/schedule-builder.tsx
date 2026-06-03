/**
 * ScheduleBuilder — Visual schedule builder with preset buttons.
 * Presets (daily, weekly, …) cover the common cases; the "Custom" tab offers a
 * friendly "every N minutes/hours/days" interval picker for non-technical users,
 * with an Advanced escape hatch to a raw cron expression for anything else.
 */
import { useState, useEffect, useRef } from "react"
import { cn } from "@houston-ai/core"
import type { SchedulePreset } from "./types"
import { SCHEDULE_PRESET_LABELS } from "./types"
import {
  TimePicker,
  DayOfWeekPicker,
  DayOfMonthPicker,
  IntervalPicker,
  CronInput,
} from "./schedule-picker-fields"
import {
  presetToCron,
  presetSummary,
  cronToPreset,
  cronToOptions,
  cronSummary,
  type ScheduleOptions,
} from "./schedule-cron-utils"
import {
  intervalToCron,
  cronToInterval,
  type ScheduleInterval,
} from "./schedule-interval-utils"

export interface ScheduleBuilderProps {
  value: string
  onChange: (cronExpression: string) => void
  presets?: SchedulePreset[]
}

const DEFAULT_PRESETS: SchedulePreset[] = [
  "every_30min", "hourly", "daily", "weekdays", "weekly", "monthly", "custom",
]

const DEFAULT_OPTIONS: ScheduleOptions = {
  time: "09:00",
  dayOfWeek: 1,
  dayOfMonth: 1,
}

const DEFAULT_INTERVAL: ScheduleInterval = { every: 5, unit: "minutes" }

const NEEDS_TIME: SchedulePreset[] = ["daily", "weekdays", "weekly", "monthly"]

export function ScheduleBuilder({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
}: ScheduleBuilderProps) {
  // Detect initial preset from incoming cron
  const detectedPreset = cronToPreset(value)
  const detectedOptions = cronToOptions(value)
  // For a custom cron, see if it maps onto the friendly interval picker; if not,
  // open straight into the Advanced raw-cron field so we never misrepresent it.
  const detectedInterval = detectedPreset === "custom" ? cronToInterval(value) : null

  const [activePreset, setActivePreset] = useState<SchedulePreset>(
    detectedPreset ?? "daily",
  )
  const [options, setOptions] = useState<ScheduleOptions>({
    ...DEFAULT_OPTIONS,
    ...detectedOptions,
  })
  const [interval, setInterval] = useState<ScheduleInterval>(
    detectedInterval ?? DEFAULT_INTERVAL,
  )
  const [advanced, setAdvanced] = useState(
    detectedPreset === "custom" && !detectedInterval,
  )
  const [customCron, setCustomCron] = useState(
    detectedPreset === "custom" && !detectedInterval ? value : "",
  )

  // Stable ref for onChange to avoid infinite effect loops
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Emit cron when preset, options, interval or advanced cron change
  useEffect(() => {
    if (activePreset === "custom") {
      if (advanced) {
        if (customCron.trim()) onChangeRef.current(customCron.trim())
      } else {
        onChangeRef.current(intervalToCron(interval, options.time))
      }
      return
    }
    const cron = presetToCron(activePreset, options)
    onChangeRef.current(cron)
  }, [activePreset, options, interval, advanced, customCron])

  const updateOption = (patch: Partial<ScheduleOptions>) => {
    setOptions((prev) => ({ ...prev, ...patch }))
  }

  const showTime = NEEDS_TIME.includes(activePreset)
  const isCustom = activePreset === "custom"
  const customCronValue = advanced
    ? customCron
    : intervalToCron(interval, options.time)

  let summary: string
  if (!isCustom) {
    summary = presetSummary(activePreset, options)
  } else if (advanced) {
    summary = customCron.trim() ? cronSummary(customCron) : "Enter a cron expression"
  } else {
    summary = cronSummary(customCronValue)
  }
  const cronDisplay = isCustom ? customCronValue : presetToCron(activePreset, options)

  return (
    <div className="space-y-4">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            onClick={() => setActivePreset(preset)}
            className={cn(
              "h-8 px-3 rounded-full text-xs font-medium transition-colors",
              activePreset === preset
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-black/[0.04] text-muted-foreground hover:text-foreground",
            )}
          >
            {SCHEDULE_PRESET_LABELS[preset]}
          </button>
        ))}
      </div>

      {/* Summary */}
      <p className="text-sm text-foreground">{summary}</p>

      {/* Preset-specific fields */}
      <div className="space-y-3">
        {showTime && (
          <TimePicker
            value={options.time}
            onChange={(time) => updateOption({ time })}
          />
        )}

        {activePreset === "weekly" && (
          <DayOfWeekPicker
            value={options.dayOfWeek}
            onChange={(dayOfWeek) => updateOption({ dayOfWeek })}
          />
        )}

        {activePreset === "monthly" && (
          <DayOfMonthPicker
            value={options.dayOfMonth}
            onChange={(dayOfMonth) => updateOption({ dayOfMonth })}
          />
        )}

        {isCustom && !advanced && (
          <>
            <IntervalPicker value={interval} onChange={setInterval} />
            {interval.unit === "days" && (
              <TimePicker
                value={options.time}
                onChange={(time) => updateOption({ time })}
              />
            )}
          </>
        )}

        {isCustom && advanced && (
          <CronInput value={customCron} onChange={setCustomCron} />
        )}

        {isCustom && (
          <button
            onClick={() => setAdvanced((a) => !a)}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {advanced ? "← Back to simple picker" : "Advanced: enter cron expression"}
          </button>
        )}
      </div>

      {/* Cron expression display */}
      {cronDisplay && (
        <p className="text-[11px] text-muted-foreground font-mono">
          cron: {cronDisplay}
        </p>
      )}
    </div>
  )
}
