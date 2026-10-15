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
  content: string,
  kind: "timetable" | "grades",
): void {
  if (typeof content !== "string") return;
  const trimmed = content.trim();

  // 1. 如果教务直接返回 JSON 格式数据（SDUST 强智系统新接口），直接放行
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed &&
        (Array.isArray(parsed) ||
          Array.isArray(parsed.data) ||
          Array.isArray(parsed.items) ||
          Array.isArray(parsed.rows) ||
          parsed.total !== undefined ||
          parsed.code !== undefined ||
          parsed.status !== undefined ||
          parsed.success !== undefined)
      ) {
        return;
      }
    } catch (_) {
      // 不是合法的 JSON 则回退到 HTML 表格校验
    }
  }

  // 2. 如果教务提示无匹配记录（例如新学期尚未出分），属于合法空结果，不抛错
  if (
    /(?:没有找到符合条件的记录|暂无数据|暂无成绩|没有查询到数据|未查询到记录)/.test(
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
        (kind === "timetable" ? "课表" : "成绩") +
        "，已保留原有数据，请稍后重试",
    );
}

