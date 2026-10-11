export function zonedParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  const offset = timeZoneOffset(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

export function periodBounds(
  preset: "this_month" | "this_year",
  timeZone: string,
  now = new Date(),
): { from: string; to: string } {
  const { year, month } = zonedParts(now, timeZone);
  if (preset === "this_year") {
    return {
      from: zonedDateTimeToUtc(year, 1, 1, 0, 0, 0, 0, timeZone).toISOString(),
      to: zonedDateTimeToUtc(year, 12, 31, 23, 59, 59, 999, timeZone).toISOString(),
    };
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: zonedDateTimeToUtc(year, month, 1, 0, 0, 0, 0, timeZone).toISOString(),
    to: zonedDateTimeToUtc(year, month, lastDay, 23, 59, 59, 999, timeZone).toISOString(),
  };
}

function timeZoneOffset(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  let hour = value("hour");
  if (hour === 24) {
    hour = 0;
  }
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), hour, value("minute"), value("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function assertValidTimeZone(timeZone: string): void {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
  } catch {
    throw new Error("Unknown timezone");
  }
}
