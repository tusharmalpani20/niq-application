/** Compare the current total with the total that existed 30 days ago. */
export function overviewGrowth(dates: Date[], now: Date) {
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const valid = dates.filter(date => date.getTime() <= now.getTime());
  const added = valid.filter(date => date.getTime() >= cutoff).length;
  const previous = valid.length - added;
  return { total: valid.length, added, percent: previous > 0 ? Math.round(added / previous * 100) : null };
}
