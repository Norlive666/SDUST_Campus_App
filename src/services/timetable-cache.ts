import type { CourseItem } from "./parser";
export const timetableTermKey = "shst_timetable_term";
export function bindLegacyTimetable(term: string) {
  if (localStorage.getItem("shst_timetable") !== null && !localStorage.getItem(timetableTermKey))
    localStorage.setItem(timetableTermKey, term);
}
export function readTimetableCache(term: string): CourseItem[] | null {
  try {
    if (localStorage.getItem(timetableTermKey) !== term) return null;
    const rows = JSON.parse(localStorage.getItem("shst_timetable") || "null");
    return Array.isArray(rows) ? rows.filter(c => c && typeof c.name === "string" && Array.isArray(c.weeks)) : null;
  } catch (_) { return null; }
}
