// Use local calendar dates, then UTC day numbers for arithmetic (no DST drift).
export function mondayOf(date: Date, monday = true): string {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (monday) day.setDate(day.getDate() - (day.getDay() + 6) % 7);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

function dayNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (mondayOf(date, false) !== value) return NaN;
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function weekFromAnchor(
  anchor: { week: number; monday: string }, now: Date,
): number | null {
  const start = dayNumber(anchor.monday);
  if (!Number.isInteger(anchor.week) || anchor.week < 1 || anchor.week > 25 ||
      !Number.isFinite(start) || new Date(`${anchor.monday}T12:00:00`).getDay() !== 1) return null;
  const elapsedWeeks = Math.floor((dayNumber(mondayOf(now)) - start) / 7);
  return Math.min(25, Math.max(1, anchor.week + elapsedWeeks));
}
