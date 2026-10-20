import { mondayOf, weekFromAnchor } from "./teaching-week";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { CourseItem } from "./parser";
interface WidgetPlugin {
  update(options: { snapshot: WidgetSnapshot }): Promise<void>;
  pin(): Promise<{ supported: boolean; requested: boolean }>;
}
export interface WidgetSnapshot {
  loggedIn: boolean;
  hasCache: boolean;
  weekAnchor: { week: number; monday: string } | null;
  validUntil?: string;
  validFrom?: string;
  courses: { name: string; room: string; day: number; section: number; weeks: number[] }[];
}
const widget = registerPlugin<WidgetPlugin>("TimetableWidget");
export const supportsNativeWidget = () => Capacitor.getPlatform() === "android";
export function makeWidgetSnapshot(user: { isLoggedIn: boolean; curTerm?: string; weekAnchor?: { week: number; monday: string } | null }, courses: CourseItem[], hasCache: boolean): WidgetSnapshot {
  if (!user.isLoggedIn) return { loggedIn: false, hasCache: false, weekAnchor: null, courses: [] };
  const anchor = user.weekAnchor;
  const validity: { validUntil?: string; validFrom?: string } = {};
  if (user.curTerm && /^\d{4}-\d{4}-[12]$/.test(user.curTerm)) {
    validity.validUntil = `${user.curTerm.slice(5, 9)}-${user.curTerm.endsWith("-1") ? "03-01" : "08-01"}`;
    if (anchor && weekFromAnchor(anchor, new Date()) !== null) {
      const first = new Date(`${anchor.monday}T12:00:00`);
      first.setDate(first.getDate() - (anchor.week - 1) * 7);
      const end = new Date(first); end.setDate(end.getDate() + 25 * 7);
      validity.validFrom = mondayOf(first, false);
      const last = mondayOf(end, false);
      if (last < validity.validUntil) validity.validUntil = last;
    }
  }
  return {
    loggedIn: true, hasCache,
    ...validity,
    weekAnchor: anchor ? { week: anchor.week, monday: anchor.monday } : null,
    courses: hasCache ? (Array.isArray(courses) ? courses : []).slice(0, 500).filter(c => c && Number.isInteger(c.day) && c.day >= 0 && c.day <= 6 && Number.isInteger(c.section) && c.section >= 0 && c.section < 5)
      .map(c => ({ name: String(c.name || "").slice(0, 80), room: String(c.classroom || "").slice(0, 60), day: c.day, section: c.section,
        weeks: (Array.isArray(c.weeks) ? c.weeks : []).filter(w => Number.isInteger(w) && w >= 1 && w <= 25).slice(0, 25) })) : [],
  };
}
let queue = Promise.resolve();
let lastSnapshot = "";
export function syncTimetableWidget(snapshot: WidgetSnapshot): Promise<void> {
  if (!supportsNativeWidget()) return Promise.resolve();
  const serialized = JSON.stringify(snapshot);
  // Serialize writes so a logout cannot be overwritten by a prior in-flight sync.
  queue = queue.catch(() => {}).then(async () => {
    if (lastSnapshot === serialized) return;
    await widget.update({ snapshot });
    lastSnapshot = serialized;
  });
  return queue;
}
export async function requestTimetableWidget() {
  if (!supportsNativeWidget()) return { supported: false, requested: false };
  return widget.pin();
}
