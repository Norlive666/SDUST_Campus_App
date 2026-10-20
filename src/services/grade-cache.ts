import { resolveGrade } from "./grade-result";
import type { GradeItem } from "./parser";

function normalize(rows: GradeItem[]): GradeItem[] {
  return rows.filter(g => g && typeof g.name === "string" && typeof g.score === "string").map(g => ({
    ...g, ...resolveGrade({ raw: g.score, remark: g.remark, nature: g.examNature, gpa: g.gpa }),
    originalScore: g.originalScore,
  }));
}
export function readGradeCache(term: string): GradeItem[] {
  try {
    const cache = JSON.parse(localStorage.getItem("shst_grades") || "{}");
    // Migrate the original all-semester array without losing offline access.
    if (Array.isArray(cache))
      return normalize(term === "all" ? cache : cache.filter((g) => g.term === term));
    const rows = cache.byTerm?.[term];
    return Array.isArray(rows) ? normalize(rows) : [];
  } catch (_) {
    return [];
  }
}

export function saveGradeCache(term: string, rows: GradeItem[]) {
  try {
    const old = JSON.parse(localStorage.getItem("shst_grades") || "{}");
    const byTerm = Array.isArray(old) ? { all: old } : old.byTerm || {};
    byTerm[term] = rows;
    localStorage.setItem("shst_grades", JSON.stringify({ version: 2, byTerm }));
  } catch (_) {}
}
