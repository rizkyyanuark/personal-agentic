export const SCHEDULE_WINDOW_MS = 3650 * 24 * 60 * 60 * 1000;

export type ScheduleDateTimeDraft = {
  date: string;
  time: string;
  original?: { date: string; time: string; instant: string };
};

const pad = (value: number) => String(value).padStart(2, "0");

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function scheduleDateTime(instant: string): ScheduleDateTimeDraft {
  const value = new Date(instant);
  const date = localDateKey(value);
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  return { date, time, original: { date, time, instant } };
}

export function scheduleDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined;
}

export function resolveScheduleStart(
  draft: ScheduleDateTimeDraft,
  now = Date.now(),
): { ok: true; instant: string } | { ok: false; error: string } {
  const day = scheduleDate(draft.date);
  const clock = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(draft.time);
  if (!day || !clock) return { ok: false, error: "Choose a complete date and time, including a valid time of day." };
  const hours = Number(clock[1]);
  const minutes = Number(clock[2]);
  const seconds = Number(clock[3] ?? "0");
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return { ok: false, error: "Enter a valid time between 00:00:00 and 23:59:59." };
  }
  const local = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, seconds);
  if (local.getFullYear() !== day.getFullYear() || local.getMonth() !== day.getMonth()
    || local.getDate() !== day.getDate() || local.getHours() !== hours
    || local.getMinutes() !== minutes || local.getSeconds() !== seconds) {
    return { ok: false, error: "This local time does not exist because the clocks change. Choose another time." };
  }
  const time = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  // The second occurrence of a repeated local hour has a distinct UTC instant.
  const instant = draft.original?.date === draft.date && draft.original.time === time
    ? new Date(draft.original.instant)
    : local;
  if (!Number.isFinite(instant.getTime()) || instant.getTime() <= now) {
    return { ok: false, error: "Choose a future date and time." };
  }
  if (instant.getTime() >= now + SCHEDULE_WINDOW_MS) {
    return { ok: false, error: "Choose a future time within ten years (3650 days)." };
  }
  return { ok: true, instant: instant.toISOString() };
}

export function resolveOptionalScheduleStart(
  draft: ScheduleDateTimeDraft,
  now = Date.now(),
): { ok: true; instant: string | null } | { ok: false; error: string } {
  if (!draft.date && !draft.time) {
    return { ok: true, instant: null };
  }
  const result = resolveScheduleStart(draft, now);
  if (!result.ok) return result;
  return { ok: true, instant: result.instant };
}
