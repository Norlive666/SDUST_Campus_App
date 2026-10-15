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
  html: string,
  kind: "timetable" | "grades",
): void {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  const valid =
    kind === "timetable"
      ? !!doc.querySelector("#kbtable, .kbcontent, .qz-toolitiplists") ||
        tables.some(
          (t) =>
            /(?:星期一|周一)/.test(t.textContent || "") &&
            /(?:星期日|星期天|周日)/.test(t.textContent || ""),
        )
      : tables.some(
          (t) =>
            /课程名/.test(t.textContent || "") &&
            /(?:成绩|分数|总评)/.test(t.textContent || ""),
        );
  if (!valid)
    throw new Error(
      "教务返回的页面不是有效" +
        (kind === "timetable" ? "课表" : "成绩") +
        "，已保留原有数据，请稍后重试",
    );
}
