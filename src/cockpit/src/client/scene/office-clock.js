const officeParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

const officeDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

export function getOfficeTime(date = new Date()) {
  const parts = Object.fromEntries(
    officeParts.formatToParts(date).map(({ type, value }) => [type, value])
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  const timeText = `${parts.hour}:${parts.minute}`;
  const minuteKey = `${parts.year}-${parts.month}-${parts.day}T${timeText}`;
  return {
    hour,
    minute,
    second,
    timeText,
    dateText: officeDate.format(date),
    minuteKey,
    secondKey: `${minuteKey}:${parts.second}`,
    dayPeriod: hour >= 6 && hour < 18 ? 'day' : 'night'
  };
}
