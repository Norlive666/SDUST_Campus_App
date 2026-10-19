import { test, expect } from "./fixtures";

const loginHtml =
  '<form action="/jsxsd/xk/LoginToXk"><input name="userAccount"><input name="userPassword"><input name="RANDOMCODE"></form>';
const course = {
  name: "缓存课程",
  day: 0,
  section: 0,
  teacher: "老师",
  classroom: "J1-101",
  rawWeeks: "1-16周",
  weeks: [6],
};
const grade = {
  term: "2024-2025-1",
  code: "001",
  name: "缓存成绩",
  score: "88",
  credit: 2,
  gpa: 3.8,
  type: "必修",
  examType: "考试",
  isPass: true,
};
const table =
  '<table id="kbtable"><tr><th>节次</th><th>周一</th><th>周二</th><th>周三</th><th>周四</th><th>周五</th><th>周六</th><th>周日</th></tr><tr><td>1-2</td><td><div class="kbcontent">同步课程<br><font title="教师">张老师</font><br><font title="时间">1-16周</font><br><font title="教室">J1-202</font></div></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>';
const gradesHtml =
  '<table id="dataList"><tr><th>学期</th><th>课程编号</th><th>课程名称</th><th>成绩</th><th>学分</th><th>绩点</th></tr><tr><td>2024-2025-1</td><td>CS001</td><td>同步成绩</td><td>92</td><td>3</td><td>4.2</td></tr></table>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ course, grade }) => {
      localStorage.setItem(
        "shst_user",
        JSON.stringify({
          isLoggedIn: true,
          account: "student",
          curWeek: 6,
          curTerm: "2024-2025-1",
          isMockMode: false,
        }),
      );
      localStorage.setItem("shst_timetable", JSON.stringify([course]));
      localStorage.setItem("shst_grades", JSON.stringify([grade]));
    },
    { course, grade },
  );
  await page.route("**/api/jsxsd/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: loginHtml }),
  );
  await page.goto("/timetable");
  await page.getByRole("button", { name: "周课表", exact: true }).click();
  await expect(page.getByText("缓存课程", { exact: true })).toBeVisible();
});

test("expired server session keeps cached timetable and offers revalidation without logging out", async ({
  page,
}) => {
  await page.getByRole("button", { name: "同步课表" }).click();
  await expect(page.locator(".sync-error")).toContainText("教务登录已失效");
  await expect(page.getByText("缓存课程", { exact: true })).toBeVisible();
  const state = await page.evaluate(() => ({
    user: JSON.parse(localStorage.getItem("shst_user")!),
    courses: JSON.parse(localStorage.getItem("shst_timetable")!),
  }));
  expect(state.user.isLoggedIn).toBe(true);
  expect(state.courses[0].name).toBe("缓存课程");
  await page.getByRole("link", { name: "重新验证" }).click();
  await expect(page).toHaveURL(/login\?reauth=1/);
});

test("network errors, server errors and unexpected HTML never clear timetable cache", async ({
  page,
}) => {
  for (const scenario of ["network", "server", "html"]) {
    await page.route("**/api/jsxsd/**", (route) =>
      scenario === "network"
        ? route.abort()
        : route.fulfill({
            status: scenario === "server" ? 500 : 200,
            body: "<html>系统维护中</html>",
          }),
    );
    await page.getByRole("button", { name: "同步课表" }).click();
    await expect(page.locator(".sync-error")).toBeVisible();
    await expect(page.getByRole("button", { name: "同步课表" })).toBeEnabled();
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("shst_timetable")!)[0].name,
      ),
    ).toBe("缓存课程");
  }
});

test("valid data updates cache; an authenticated empty timetable remains a valid result", async ({
  page,
}) => {
  await page.route("**/api/jsxsd/**", (route) =>
    route.fulfill({ body: table }),
  );
  await page.getByRole("button", { name: "同步课表" }).click();
  await expect(page.getByText("同步课程", { exact: true })).toBeVisible();
  await page.route("**/api/jsxsd/**", (route) =>
    route.fulfill({
      body: '<table id="kbtable"><tr><th>周一</th></tr></table>',
    }),
  );
  await page.getByRole("button", { name: "同步课表" }).click();
  await expect(
    page.getByText("当前学期暂无课程", { exact: true }),
  ).toBeVisible();
});

test("grades retain legacy cache on session expiry and do not report successful refresh", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "成绩" }).click();
  await expect(page.getByText("缓存成绩", { exact: true })).toBeVisible();
  await expect(page.locator(".load-error")).toContainText("教务登录已失效");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("shst_grades")!)[0].score,
    ),
  ).toBe("88");
  await expect(page.getByText("成绩已刷新", { exact: true })).toHaveCount(0);
});

test("grade module initializes first and parses the actual table behind a layout table", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/api/jsxsd/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      body: route.request().url().includes("cjcx_query")
        ? "查询条件"
        : "<table><tr><td>页面导航</td></tr></table>" +
          gradesHtml.replace(' id="dataList"', ""),
    });
  });
  await page.getByRole("tab", { name: "成绩" }).click();
  await expect(page.getByText("同步成绩", { exact: true })).toBeVisible();
  expect(requests[0]).toContain("cjcx_query");
  expect(requests[1]).toContain("cjcx_list");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("shst_grades")!).byTerm.all[0].score,
    ),
  ).toBe("92");
});

test("cookie attributes are removed, multiple cookies merged, expired cookies deleted", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    // @ts-ignore Vite serves application modules directly for integration tests.
    const { mergeResponseCookies, normalizeCookieHeader } =
      await import("/src/services/cookies.ts");
    return [
      normalizeCookieHeader("JSESSIONID=old; Path=/; HttpOnly; SameSite=Lax"),
      mergeResponseCookies(
        "JSESSIONID=old; route=one",
        "JSESSIONID=new; Path=/; HttpOnly, token=abc; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Secure",
      ),
      mergeResponseCookies(
        "JSESSIONID=new; route=one",
        "JSESSIONID=; Max-Age=0; Path=/",
      ),
    ];
  });
  expect(result).toEqual([
    "JSESSIONID=old",
    "JSESSIONID=new; route=one; token=abc",
    "route=one",
  ]);
});

test("login page mentioning jsxsd is not accepted as successful authentication", async ({
  page,
}) => {
  const result = await page.evaluate(async (loginHtml) => {
    // @ts-ignore
    const { api } = await import("/src/services/api.ts");
    // @ts-ignore
    const { http } = await import("/src/services/http.ts");
    http.request = async (options: any) => ({
      status: 200,
      data:
        options.url === ""
          ? '<script>var scode="seed";var sxh="123";</script>'
          : loginHtml,
      headers: {},
    });
    return api.login("student", "fake-test-password", "1234");
  }, loginHtml);
  expect(result.success).toBe(false);
});

test("simultaneous expired requests share one automatic login and retry with original filters", async ({
  page,
}) => {
  const result = await page.evaluate(
    async ({ loginHtml, table, gradesHtml }) => {
      // @ts-ignore
      const { api } = await import("/src/services/api.ts");
      // @ts-ignore
      const { http } = await import("/src/services/http.ts");
      // @ts-ignore
      const { credentials } = await import("/src/services/credentials.ts");
      await credentials.save({
        account: "student",
        password: "fake-test-password",
      });
      const canvas = document.createElement("canvas");
      canvas.width = 62;
      canvas.height = 22;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 62, 22);
      api.getCaptchaBase64 = async () => canvas.toDataURL();
      let valid = false,
        logins = 0;
      const terms: string[] = [];
      http.request = async (options: any) => {
        if (options.url === "")
          return {
            status: 200,
            data: '<script>var scode="seed";var sxh="123";</script>',
            headers: {},
          };
        if (options.url === "xk/LoginToXk") {
          logins++;
          await new Promise((r) => setTimeout(r, 30));
          valid = true;
          return { status: 200, data: "欢迎您 <a>退出登录</a>", headers: {} };
        }
        if (!valid) {
          await new Promise((r) => setTimeout(r, 10));
          return { status: 200, data: loginHtml, headers: {} };
        }
        if (options.url.includes("cjcx_query"))
          return { status: 200, data: "查询条件", headers: {} };
        terms.push(options.data?.xnxq01id || options.data?.kksj);
        return {
          status: 200,
          data: options.url.includes("xskb") ? table : gradesHtml,
          headers: {},
        };
      };
      const [t, g] = await Promise.all([
        api.getTimetable("2024-2025-1"),
        api.getGrades("2024-2025-1"),
      ]);
      return {
        logins,
        courses: t.courses.length,
        grades: g.length,
        terms,
        local: localStorage.getItem("shst_user"),
      };
    },
    { loginHtml, table, gradesHtml },
  );
  expect(result.logins).toBe(1);
  expect(result.courses).toBe(1);
  expect(result.grades).toBe(1);
  expect(result.terms).toEqual(["2024-2025-1", "2024-2025-1"]);
  expect(result.local).not.toContain("fake-test-password");
});

test("per-semester grade caches do not overwrite each other and legacy data migrates", async ({
  page,
}) => {
  const result = await page.evaluate(async (grade) => {
    // @ts-ignore
    const { readGradeCache, saveGradeCache } =
      await import("/src/services/grade-cache.ts");
    saveGradeCache("2025-2026-1", []);
    return { all: readGradeCache("all"), other: readGradeCache("2025-2026-1") };
  }, grade);
  expect(result.all[0].name).toBe("缓存成绩");
  expect(result.other).toEqual([]);
});

test("failed automatic login is bounded and retains the cached timetable", async ({
  page,
}) => {
  const result = await page.evaluate(async (loginHtml) => {
    // @ts-ignore
    const { api } = await import("/src/services/api.ts");
    // @ts-ignore
    const { http } = await import("/src/services/http.ts");
    // @ts-ignore
    const { credentials } = await import("/src/services/credentials.ts");
    // @ts-ignore
    const { useTimetableStore } = await import("/src/stores/timetable.ts");
    await credentials.save({
      account: "student",
      password: "fake-test-password",
    });
    const canvas = document.createElement("canvas");
    canvas.width = 62;
    canvas.height = 22;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 62, 22);
    api.getCaptchaBase64 = async () => canvas.toDataURL();
    let logins = 0;
    http.request = async (options: any) => {
      if (options.url === "")
        return {
          status: 200,
          data: '<script>var scode="seed";var sxh="123";</script>',
          headers: {},
        };
      if (options.url === "xk/LoginToXk") {
        logins++;
        return { status: 200, data: loginHtml + "验证码错误", headers: {} };
      }
      return { status: 200, data: loginHtml, headers: {} };
    };
    let error = "";
    try {
      await useTimetableStore().fetchTimetable("2024-2025-1");
    } catch (e) {
      error = (e as Error).name;
    }
    return {
      logins,
      error,
      cached: JSON.parse(localStorage.getItem("shst_timetable")!)[0].name,
      loading: useTimetableStore().isLoading,
    };
  }, loginHtml);
  expect(result).toEqual({
    logins: 3,
    error: "SessionExpiredError",
    cached: "缓存课程",
    loading: false,
  });
});

test("logout clears credentials and invalidates in-flight requests before they can repopulate caches", async ({
  page,
}) => {
  const result = await page.evaluate(async (table) => {
    // @ts-ignore
    const { http } = await import("/src/services/http.ts");
    // @ts-ignore
    const { credentials } = await import("/src/services/credentials.ts");
    // @ts-ignore
    const { useUserStore } = await import("/src/stores/user.ts");
    // @ts-ignore
    const { useTimetableStore } = await import("/src/stores/timetable.ts");
    await credentials.save({
      account: "student",
      password: "fake-test-password",
    });
    let finish: any;
    http.request = () =>
      new Promise((resolve) => {
        finish = () => resolve({ status: 200, data: table, headers: {} });
      });
    const request = useTimetableStore()
      .fetchTimetable("2024-2025-1")
      .catch((e: Error) => e.name);
    await useUserStore().logout();
    finish();
    const error = await request;
    return {
      error,
      credentials: await credentials.read(),
      cache: localStorage.getItem("shst_timetable"),
      courses: useTimetableStore().courses.length,
      logged: useUserStore().isLoggedIn,
    };
  }, table);
  expect(result).toEqual({
    error: "SessionExpiredError",
    credentials: null,
    cache: null,
    courses: 0,
    logged: false,
  });
});

test("grade POST fallback preserves the requested semester when GET succeeds", async ({
  page,
}) => {
  const result = await page.evaluate(async (gradesHtml) => {
    // @ts-ignore
    const { api } = await import("/src/services/api.ts");
    // @ts-ignore
    const { http } = await import("/src/services/http.ts");
    const seen: any[] = [];
    http.request = async (options: any) => {
      seen.push(options);
      return {
        status: options.method === "POST" ? 405 : 200,
        data: gradesHtml,
        headers: {},
      };
    };
    const grades = await api.getGrades("2024-2025-1");
    return {
      grades: grades.length,
      filter: seen.at(-1).params.kksj,
      method: seen.at(-1).method,
    };
  }, gradesHtml);
  expect(result).toEqual({ grades: 1, filter: "2024-2025-1", method: "GET" });
});

test("login accepts a redirect to the student portal but rejects a redirect back to login", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    // @ts-ignore
    const { api } = await import("/src/services/api.ts");
    // @ts-ignore
    const { http } = await import("/src/services/http.ts");
    let target = "/jsxsd/framework/xsMainV.htmlx";
    http.request = async (options: any) =>
      options.url === ""
        ? {
            status: 200,
            data: '<script>var scode="seed";var sxh="123";</script>',
            headers: {},
          }
        : { status: 302, data: "", headers: { Location: target } };
    const accepted = await api.login(
      "student",
      "fake-test-password",
      "1234",
      false,
    );
    target = "/jsxsd/";
    const rejected = await api.login(
      "student",
      "fake-test-password",
      "1234",
      false,
    );
    return [accepted.success, rejected.success];
  });
  expect(result).toEqual([true, false]);
});
