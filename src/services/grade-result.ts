export type GradeStatus = "pass" | "fail" | "pending" | "exempt" | "unknown";
export const valueText = (value: unknown): string => value == null ? "" : String(value).trim();
export function numericScore(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return number >= 0 && number <= 100 ? number : null;
}
const gradePoints: Record<string, number> = { 优: 4.5, 优秀: 4.5, 良: 3.5, 良好: 3.5, 中: 2.5, 中等: 2.5, 及格: 1.5, 合格: 1.5, 通过: 1.5 };
const empty = (text: string) => !text || /^(?:[-—–/]+|null|undefined|(?:成绩)?(?:未录入|未公布|未出分|待出分|待公布|待录入|待审核)|暂无成绩|尚未录入)$/i.test(text);
const isResult = (text: string) => numericScore(text) !== null || text in gradePoints || /^(不及格|不合格|未通过)$/.test(text);

export const joinGradeText = (...values: unknown[]): string => [...new Set(values.map(valueText).filter(Boolean))].join(" · ");
// Several result aliases can coexist: a zero placeholder must not hide a later
// published result. Keep zero only when no nonzero/qualitative value is present.
export function pickGradeResult(...values: unknown[]): string {
  const texts = values.map(valueText).filter(text => !empty(text));
  return texts.find(text => isResult(text) && numericScore(text) !== 0) ||
    texts.find(text => !/^0(?:\.0+)?$/.test(text)) || texts[0] || "";
}
export function gradeExamNature(nature: string, ...evidence: string[]): string | undefined {
  if (/缓考|补考|重修/.test(nature)) return nature;
  const special = evidence.join(" · ").match(/缓考|补考|重修/);
  return special?.[0] || nature || undefined;
}

export interface GradeEvidence {
  raw: string;
  makeup?: string;
  deferred?: string;
  retake?: string;
  effective?: string;
  remark?: string;
  nature?: string;
  unresolvedStatus?: boolean;
  gpa?: unknown;
}

export function resolveGrade(input: GradeEvidence) {
  const raw = valueText(input.raw), makeup = valueText(input.makeup), effective = valueText(input.effective);
  const deferredScore = valueText(input.deferred), retakeScore = valueText(input.retake);
  const remark = valueText(input.remark), nature = valueText(input.nature);
  const context = joinGradeText(raw, nature, remark);
  const deferred = /缓考/.test(context);
  const makeupExam = /补考|重修/.test(context);
  let score = empty(raw) ? "" : raw;
  // An extra zero alone does not prove an exam has been graded. A published
  // nonzero/qualitative replacement does override the original failure marker.
  const replacements = [effective, retakeScore, makeup, deferredScore];
  const replacement = replacements.find(text => isResult(text) && numericScore(text) !== 0);
  if (replacement) score = replacement;
  else if (!score && !deferred && !makeupExam && numericScore(effective) === 0) score = effective;
  const replaced = Boolean(replacement);
  const marker = [raw, remark].find(text => /缺考|旷考|作弊|违纪/.test(text));
  const exemption = remark.split(" · ").find(text => /^(免修|免考|免修免考)$/.test(text));
  let status: GradeStatus;
  if (marker && !replaced) {
    score = marker.match(/缺考|旷考|作弊|违纪/)![0]; status = "fail";
  } else if (deferred && !replaced && (!score || numericScore(score) === 0 || score === "缓考")) {
    score = "缓考"; status = "pending";
  } else if (/^(免修|免考|免修免考)$/.test(score) || ((!score || numericScore(score) === 0) && exemption)) {
    score = /免/.test(score) ? score : exemption!; status = "exempt";
  } else if (!replaced && (!score || numericScore(score) === 0) && /未出分|待出分|未录入|待录入|未公布|待公布|待审核/.test(context)) {
    score = makeupExam ? (/重修/.test(context) ? "重修" : "补考") : "暂无成绩"; status = "pending";
  } else if (!replaced && makeupExam && numericScore(score) === 0 && !/不及格|不合格|未通过/.test(remark)) {
    // The response does not distinguish an unfilled zero from a genuine zero.
    // Show uncertainty and exclude it from failed counts/GPA until confirmed.
    status = "unknown";
  } else if (!replaced && input.unresolvedStatus && numericScore(score) === 0 && !/不及格|不合格|未通过/.test(remark)) {
    status = "unknown";
  } else if (!score || /^(补考|待补考|缓考|待考|待公布|成绩未录入)$/.test(score)) {
    score = score || (/缓考/.test(nature + remark) ? "缓考" : /补考/.test(nature + remark) ? "补考" : "暂无成绩");
    status = "pending";
  } else if (numericScore(score) !== null) status = numericScore(score)! >= 60 ? "pass" : "fail";
  else if (score in gradePoints) status = "pass";
  else if (/^(不及格|不合格|未通过)$/.test(score)) status = "fail";
  else status = "unknown";
  const serverGpa = valueText(input.gpa);
  const explicitGpa = /^(?:\d+(?:\.\d+)?)$/.test(serverGpa) && Number(serverGpa) <= 5;
  const n = numericScore(score);
  // Preserve a real server GPA of 0 instead of treating it as missing.
  const gpa = status !== "pass" && status !== "fail" ? 0 : status === "fail" ? 0 :
    explicitGpa ? Number(serverGpa) : n !== null ? Number(((n - 60) / 10 + 1).toFixed(1)) : gradePoints[score] || 0;
  return { score, status, isPass: status === "pass", gpa, originalScore: raw || undefined };
}
interface GradeDisplayEvidence {
  score: string; status?: GradeStatus; isPass: boolean; originalScore?: string;
  makeupScore?: string; deferredScore?: string; retakeScore?: string; effectiveScore?: string;
  remark?: string; examNature?: string;
  unresolvedStatus?: boolean;
}
export function gradeStatus(grade: GradeDisplayEvidence): GradeStatus {
  return grade.status || resolveGrade({ raw: grade.originalScore ?? grade.score, makeup: grade.makeupScore,
    deferred: grade.deferredScore, retake: grade.retakeScore, effective: grade.effectiveScore,
    remark: grade.remark, nature: grade.examNature, unresolvedStatus: grade.unresolvedStatus }).status;
}
export function isSpecialGrade(grade: GradeDisplayEvidence): boolean {
  return /缓考|补考|重修/.test(joinGradeText(grade.score, grade.examNature, grade.remark)) ||
    [grade.makeupScore, grade.deferredScore, grade.retakeScore].some(value => {
      const text = valueText(value);
      return Boolean(text && !empty(text) && numericScore(text) !== 0);
    });
}
export const gradeStatusLabel = (grade: GradeDisplayEvidence) => {
  const status = gradeStatus(grade);
  const special = joinGradeText(grade.examNature, grade.remark, grade.score).match(/缓考|补考|重修/)?.[0];
  return status === "pass" ? "已通过" : status === "fail" ? "未通过" : status === "exempt" ? "免修/免考" : status === "unknown" ? (special ? `${special}成绩待核实` : "状态待核实") : special ? `${special}待出分` : "待出分";
};
