export type FacilityTrend = {
  months: { month: string; count: number }[];
  previous: { count: number; through: string } | null;
};

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

// Buckets and comparison periods follow the facility's calendar, including for staff in other timezones.
export function facilityTrend(dates: Date[], now: Date, timezone: string): FacilityTrend {
  const current = localParts(now, timezone);
  const months = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(Date.UTC(current.year, current.month - 6 + index, 1));
    return { month: monthKey(month.getUTCFullYear(), month.getUTCMonth() + 1), count: 0 };
  });
  const previous = new Date(Date.UTC(current.year, current.month - 2, 1));
  const previousYear = previous.getUTCFullYear();
  const previousMonth = previous.getUTCMonth() + 1;
  const hasSameDay = current.day <= new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
  let previousCount = 0;
  for (const date of dates) {
    if (date > now) continue;
    const part = localParts(date, timezone);
    const key = monthKey(part.year, part.month);
    const bucket = months.find(item => item.month === key);
    if (bucket) bucket.count++;
    if (hasSameDay && part.year === previousYear && part.month === previousMonth &&
      (part.day < current.day || part.day === current.day &&
        (part.hour < current.hour || part.hour === current.hour &&
          (part.minute < current.minute || part.minute === current.minute && part.second <= current.second)))) previousCount++;
  }
  return {
    months,
    previous: hasSameDay ? { count: previousCount, through: `${monthKey(previousYear, previousMonth)}-${String(current.day).padStart(2, "0")}` } : null,
  };
}
