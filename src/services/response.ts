export class SessionExpiredError extends Error {
  constructor(message = "教务登录已失效，请重新验证登录；已有缓存仍可查看") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

export function isLoginResponse(response: {
  status: number;
  data: unknown;
  url?: string;
  headers?: Record<string, string>;
}): boolean {
  if ([401, 403].includes(response.status)) return true;
  const redirect =
    response.headers?.Location || response.headers?.location || "";
  if (
    response.status >= 300 &&
    response.status < 400 &&
    /(?:\/jsxsd\/?(?:[?#].*)?$|\/xtgl\/login|\/xk\/LoginToXk)/i.test(redirect)
  )
    return true;
  if (response.url && /\/(?:xtgl\/login)[/?]?/i.test(response.url)) return true;
  let data = response.data;
  if (typeof data === "string" && /^[\s]*[\[{]/.test(data)) {
    try { data = JSON.parse(data); } catch (_) {}
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const result = data as Record<string, unknown>;
    return [401, 403, "401", "403"].includes(result.code as never) ||
      /请先登录|请重新登[录陆]|登录超时|会话[已]?过期|未登录/.test(String(result.message || result.msg || ""));
  }
  if (typeof response.data !== "string") return false;
  const html = response.data;
  return (
    /(?:name|id)\s*=\s*["'](?:userAccount|userPassword|RANDOMCODE)["']/i.test(
      html,
    ) ||
    /(?:请先登录|请重新登[录陆]|登录超时|会话[已]?过期|未登录|尚未登录)/.test(
      html,
    ) ||
    /(?:location(?:\.href)?\s*=|location\.replace\s*\()\s*["'][^"']*(?:\/jsxsd\/?["']|\/login\b)/i.test(
      html,
    )
  );
}

export function requireDataPage(
  content: unknown,
  kind: "timetable" | "grades" | "exams",
): void {
  let parsed: any = content;
  const trimmed = typeof content === "string" ? content.trim() : "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try { parsed = JSON.parse(trimmed); } catch (_) { throw new Error("教务返回的数据格式异常，已保留缓存"); }
  }
  if (parsed && typeof parsed === "object") {
    if (!Array.isArray(parsed) && (parsed.success === false || parsed.status === false || /^(error|fail|failed)$/i.test(String(parsed.status || "")) ||
        (parsed.code != null && ![0, 200, "0", "200", "success", "SUCCESS"].includes(parsed.code))))
      throw new Error("教务接口返回错误，已保留缓存，请稍后重试");
    const hasRows = (value: any): boolean => Array.isArray(value) ||
      (!!value && typeof value === "object" && ["data", "rows", "items", "list", "records"].some(key => Array.isArray(value[key]) || (key === "data" && value[key] && ["rows", "items", "list", "records"].some(nested => Array.isArray(value[key][nested])))));
    if (hasRows(parsed) || parsed.total === 0) return;
    throw new Error("教务返回的数据不含有效记录，已保留缓存");
  }

  // 2. 如果教务提示无匹配记录（例如新学期尚未出分），属于合法空结果，不抛错
  if (
    /(?:没有找到符合条件的记录|暂无数据|暂无成绩|暂无考试|没有查询到数据|未查询到记录)/.test(
      trimmed,
    )
  ) {
    return;
  }

  // 3. HTML 表格结构校验
  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  const valid =
    kind === "timetable"
      ? !!doc.querySelector("#kbtable, .kbcontent, .qz-toolitiplists") ||
        tables.some(
          (t) =>
            /(?:星期一|周一)/.test(t.textContent || "") &&
            /(?:星期日|星期天|周日)/.test(t.textContent || ""),
        )
      : kind === "exams" ? tables.some(t => /课程名|考试科目/.test(t.textContent || "") && /考试时间|考试日期/.test(t.textContent || "")) || /暂无考试|暂无数据|没有查询到数据|没有找到符合条件的记录|未查询到记录/.test(doc.body?.textContent || "")
      : tables.some(
          (t) =>
            /课程名/.test(t.textContent || "") &&
            /(?:成绩|分数|总评)/.test(t.textContent || ""),
        ) ||
        !!doc.querySelector("#dataList") ||
        /(?:没有找到符合条件的记录|暂无成绩|暂无数据)/.test(
          doc.body?.textContent || "",
        );

  if (!valid)
    throw new Error(
      "教务返回的页面不是有效" +
        (kind === "timetable" ? "课表" : kind === "exams" ? "考试安排" : "成绩") +
        "，已保留原有数据，请稍后重试",
    );
}

