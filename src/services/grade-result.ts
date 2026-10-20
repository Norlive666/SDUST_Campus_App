export type GradeStatus = "pass" | "fail" | "pending" | "exempt" | "unknown";
export const valueText = (value: unknown): string => value == null ? "" : String(value).trim();
export function numericScore(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return number >= 0 && number <= 100 ? number : null;
}
const gradePoints: Record<string, number> = { 优: 4.5, 优秀: 4.5, 良: 3.5, 良好: 3.5, 中: 2.5, 中等: 2.5, 及格: 1.5, 合格: 1.5, 通过: 1.5 };
const empty = (text: string) => !text || /^(?:[-—–/]+|null|undefined|未录入|未出分|暂无成绩|待出分)$/i.test(text);
const isResult = (text: string) => numericScore(text) !== null || text in gradePoints || /^(不及格|不合格|未通过)$/.test(text);

export function resolveGrade(input: { raw: string; makeup?: string; effective?: string; remark?: string; nature?: string; gpa?: unknown }) {
  const raw = valueText(input.raw), makeup = valueText(input.makeup), effective = valueText(input.effective);
  const remark = valueText(input.remark), nature = valueText(input.nature);
  const deferred = /缓考/.test(raw + nature + remark);
  const makeupExam = /补考|重修/.test(nature);
  let score = empty(raw) ? "" : raw;
  // Zero in an extra column can be an unfilled placeholder. An explicit makeup
  // record permits zero; a positive/qualitative replacement is always usable.
  const usable = (text: string, extra: boolean) => isResult(text) &&
    (numericScore(text) !== 0 || (extra ? makeupExam : (!score && !deferred)));
  if (usable(effective, false)) score = effective;
  else if (usable(makeup, true)) score = makeup;
  const replaced = score !== raw && isResult(score);
  const marker = [raw, remark].find(text => /缺考|旷考|作弊|违纪/.test(text));
  let status: GradeStatus;
  if (marker && !replaced) {
    score = marker.match(/缺考|旷考|作弊|违纪/)![0]; status = "fail";
  } else if (deferred && !replaced && (!score || numericScore(score) === 0 || score === "缓考")) {
    score = "缓考"; status = "pending";
  } else if (/^(免修|免考|免修免考)$/.test(score) || ((!score || numericScore(score) === 0) && /^(免修|免考|免修免考)$/.test(remark))) {
    score = /免/.test(score) ? score : remark; status = "exempt";
  } else if (!replaced && (!score || numericScore(score) === 0) && /未出分|待出分|未录入/.test(remark)) {
    score = /补考/.test(nature + remark) ? "补考" : "暂无成绩"; status = "pending";
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
export function gradeStatus(grade: { score: string; status?: GradeStatus; isPass: boolean }): GradeStatus {
  return grade.status || resolveGrade({ raw: grade.score }).status;
}
export const gradeStatusLabel = (grade: { score: string; status?: GradeStatus; isPass: boolean }) => {
  const status = gradeStatus(grade);
  return status === "pass" ? "已通过" : status === "fail" ? "未通过" : status === "exempt" ? "免修/免考" : status === "unknown" ? "状态待核实" : grade.score === "缓考" ? "缓考待出分" : "待出分";
};
