export type MonthlyTrend = {
  months: Array<{ month: Date; count: number }>;
  previous: { count: number; through: Date } | null;
};

export function monthlyTrend(dates: Date[], now: Date): MonthlyTrend {
  const months = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return {
      month,
      count: dates.filter(date => date <= now && date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth()).length,
    };
  });
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const through = new Date(start.getFullYear(), start.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  // A shorter previous month cannot provide the same local calendar period.
  const previous = through.getFullYear() === start.getFullYear() && through.getMonth() === start.getMonth()
    ? { count: dates.filter(date => date >= start && date <= through).length, through }
    : null;
  return { months, previous };
}
