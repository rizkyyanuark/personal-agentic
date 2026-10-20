import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverClose, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { localDateKey, scheduleDate, SCHEDULE_WINDOW_MS, type ScheduleDateTimeDraft } from "./scheduleTime";

export type ScheduleDateTimeProps = {
  value: ScheduleDateTimeDraft;
  onChange: (value: ScheduleDateTimeDraft) => void;
  disabled: boolean;
  invalid?: boolean;
  optional?: boolean;
  idPrefix?: string;
  labelDate?: string;
  labelTime?: string;
  notePrefix?: string;
  popoverTitle?: string;
  onClear?: () => void;
};

export function ScheduleDateTime({
  value,
  onChange,
  disabled,
  invalid = false,
  optional = false,
  idPrefix = "task",
  labelDate = "Send date",
  labelTime = "Send time",
  notePrefix = "Send at",
  popoverTitle,
  onClear,
}: ScheduleDateTimeProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => scheduleDate(value.date) ?? new Date());
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const selected = scheduleDate(value.date);
  const today = new Date();
  const lower = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const upper = new Date(today.getTime() + SCHEDULE_WINDOW_MS);
  const upperDay = new Date(upper.getFullYear(), upper.getMonth(), upper.getDate());
  const titleText = popoverTitle ?? (optional ? "Choose planned date" : "Choose send date");

  return <>
    <p id={`${idPrefix}-timezone`} className="schedule-note">{notePrefix} · {timeZone}</p>
    <div className="schedule-date-time">
      <div className="schedule-date-field">
        <Label htmlFor={`${idPrefix}-start`}>{labelDate}</Label>
        <Popover open={open} onOpenChange={(next) => {
          if (next) setMonth(selected ?? new Date());
          setOpen(next);
        }}>
          <PopoverTrigger render={<Button id={`${idPrefix}-start`} type="button" variant="outline" className="schedule-date-trigger" disabled={disabled} aria-invalid={invalid} aria-describedby={`${idPrefix}-timezone`} />}>
            <CalendarDays data-icon="inline-start" />
            <span>{selected ? selected.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : value.date || (optional ? "Choose a date (optional)" : "Choose a date")}</span>
          </PopoverTrigger>
          <PopoverContent aria-label={titleText} initialFocus={true}>
            <PopoverHeader>
              <PopoverTitle>{titleText}</PopoverTitle>
              <PopoverDescription>Choose a day or enter YYYY-MM-DD. Times use {timeZone}.</PopoverDescription>
            </PopoverHeader>
            <div className="schedule-date-entry">
              <Label htmlFor={`${idPrefix}-date-entry`}>Date (YYYY-MM-DD)</Label>
              <Input id={`${idPrefix}-date-entry`} type="text" placeholder="YYYY-MM-DD" autoComplete="off" inputMode="numeric" value={value.date} aria-invalid={!!value.date && !selected} onChange={(event) => {
                const date = event.target.value;
                onChange({ ...value, date });
                const next = scheduleDate(date);
                if (next) setMonth(next);
              }} />
            </div>
            <Calendar
              mode="single"
              required
              selected={selected}
              month={month}
              onMonthChange={setMonth}
              timeZone={timeZone}
              startMonth={lower}
              endMonth={upperDay}
              disabled={[{ before: lower }, { after: upperDay }]}
              onSelect={(day) => {
                if (!day) return;
                onChange({ ...value, date: localDateKey(day) });
                setOpen(false);
              }}
            />
            <PopoverClose render={<Button type="button" variant="outline" className="schedule-calendar-done" />}>Done</PopoverClose>
          </PopoverContent>
        </Popover>
      </div>
      <div className="schedule-time-field">
        <Label htmlFor={`${idPrefix}-time`}>{labelTime}</Label>
        <Input id={`${idPrefix}-time`} type="time" step="1" required={!optional} disabled={disabled} value={value.time} aria-invalid={invalid} aria-describedby={`${idPrefix}-timezone`} onChange={(event) => onChange({ ...value, time: event.target.value })} />
      </div>
    </div>
    {optional && (
      <div className="schedule-clear-container" style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="schedule-clear"
          aria-label="Clear planned start"
          disabled={disabled || (!value.date && !value.time)}
          onClick={() => {
            onChange({ date: "", time: "", original: undefined });
            onClear?.();
          }}
        >
          Clear planned start
        </Button>
      </div>
    )}
  </>;
}
