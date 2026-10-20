export interface ExamTiming { daysLeft?: number; phase: "unknown" | "upcoming" | "ongoing" | "ended"; startsAt?: number; endsAt?: number }
export function examTiming(time: string, now = new Date()): ExamTiming {
  const match = String(time).match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
  if (!match) return { phase: "unknown" };
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return { phase: "unknown" };
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = (Date.UTC(year, month - 1, day) - today) / 86400000;
  const times = Array.from(time.slice(match.index! + match[0].length).matchAll(/(\d{1,2}):([0-5]\d)/g));
  const stamp = (value: RegExpMatchArray) => {
    const hour = Number(value[1]);
    return hour < 24 ? new Date(year, month - 1, day, hour, Number(value[2])).getTime() : undefined;
  };
  const startsAt = times[0] ? stamp(times[0]) : undefined;
  let endsAt = times[1] ? stamp(times[1]) : undefined;
  if (startsAt !== undefined && endsAt !== undefined && endsAt < startsAt) {
    const end = new Date(endsAt); end.setDate(end.getDate() + 1); endsAt = end.getTime();
  }
  const phase = endsAt !== undefined && now.getTime() >= endsAt ? "ended" : startsAt !== undefined && endsAt !== undefined && now.getTime() >= startsAt ? "ongoing" : daysLeft < 0 ? "ended" : "upcoming";
  return { daysLeft, phase, startsAt, endsAt };
}
