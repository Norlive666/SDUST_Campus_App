import { resolveGrade, numericScore } from "./grade-result";
import type { GradeItem } from "./parser";

function normalize(rows: GradeItem[]): GradeItem[] {
  return rows.filter(g => g && typeof g.name === "string" && typeof g.score === "string").map(g => {
    // Older caches saved the final displayed result but not its effective field.
    const recoveredEffective = g.originalScore && g.originalScore !== g.score &&
      ((numericScore(g.score) ?? 0) > 0 || /^(优|优秀|良|良好|中|中等|及格|合格|通过|不及格|不合格|未通过)$/.test(g.score)) ? g.score : undefined;
    const evidence = { raw: g.originalScore ?? g.score, makeup: g.makeupScore, deferred: g.deferredScore,
      retake: g.retakeScore, effective: g.effectiveScore ?? recoveredEffective, remark: g.remark,
      nature: g.examNature, unresolvedStatus: g.unresolvedStatus };
    const result = resolveGrade(evidence);
    // A legacy failed row may contain a calculated GPA of zero. Do not carry
    // that value into a recovered replacement result with a different score.
    return { ...g, ...resolveGrade({ ...evidence, gpa: result.score === g.score ? g.gpa : undefined }) };
  });
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
    localStorage.setItem("shst_grades", JSON.stringify({ version: 3, byTerm }));
  } catch (_) {}
}
