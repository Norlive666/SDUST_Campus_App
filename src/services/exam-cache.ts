import type { ExamItem } from "./parser";

export function bindLegacyExamCache(term: string) {
  try {
    const raw = JSON.parse(localStorage.getItem("shst_exams") || "null");
    if (Array.isArray(raw)) localStorage.setItem("shst_exams", JSON.stringify({ version: 2, byTerm: { [term]: raw } }));
  } catch (_) {}
}
export function readExamCache(term: string): ExamItem[] {
  try {
    const raw = localStorage.getItem("shst_exams");
    if (!raw) return [];
    const cache = JSON.parse(raw);
    if (Array.isArray(cache)) return cache;
    const rows = cache.byTerm?.[term];
    return Array.isArray(rows) ? rows : [];
  } catch (_) {
    return [];
  }
}

export function saveExamCache(term: string, rows: ExamItem[]) {
  try {
    const raw = localStorage.getItem("shst_exams");
    const old = raw ? JSON.parse(raw) : {};
    const byTerm = Array.isArray(old) ? { [term]: old } : old.byTerm || {};
    byTerm[term] = rows;
    localStorage.setItem("shst_exams", JSON.stringify({ version: 2, byTerm }));
  } catch (_) {}
}
