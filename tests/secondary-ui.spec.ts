import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const account = {
  isLoggedIn: true,
  account: "202601010101",
  name: "林同学",
  college: "计算机科学与工程学院",
  major: "软件工程",
  className: "软件工程 2024-1 班",
  curWeek: 7,
  curTerm: "2026-2027-1",
};
const grades = {
  rows: [
    {
      kcmc: "数据结构与算法",
      zcj: "92",
      xf: 4,
      jd: 4.2,
      kksj: "2026-2027-1",
      kcsx: "必修",
    },
    {
      kcmc: "高等数学（II）",
      zcj: "88",
      xf: 5,
      jd: 3.8,
      kksj: "2026-2027-1",
      kcsx: "必修",
    },
    {
      kcmc: "大学英语",
      zcj: "95",
      xf: 3,
      jd: 4.5,
      kksj: "2026-2027-1",
      kcsx: "必修",
    },
    {
      kcmc: "计算机网络",
      zcj: "56",
      xf: 3,
      jd: 0,
      kksj: "2026-2027-1",
      kcsx: "必修",
    },
    {
      kcmc: "大学体育",
      zcj: "优",
      xf: 1,
      jd: 4.5,
      kksj: "2026-2027-1",
      kcsx: "选修",
    },
  ],
};
const exams = {
  rows: [
    {
      kcmc: "数据结构与算法",
      kssj: "2026-10-22 09:00–11:00",
      js_mc: "J1-201",
      zwh: "18",
    },
    {
      kcmc: "高等数学（II）",
      kssj: "2026-10-28 14:00–16:00",
      js_mc: "J7-302",
      zwh: "06",
    },
    {
      kcmc: "大学英语",
      kssj: "2026-10-01 09:00–11:00",
      js_mc: "J3-105",
      zwh: "21",
    },
  ],
};
async function seed(page: Page, user: Record<string, any> | null = account) {
  await page.addInitScript(
    ({ user }) => {
      if (sessionStorage.getItem("ui-seeded")) return;
      sessionStorage.setItem("ui-seeded", "1");
      if (user) localStorage.setItem("shst_user", JSON.stringify(user));
      else localStorage.clear();
      localStorage.setItem(
        "shst_timetable",
        JSON.stringify([
          {
            name: "真实缓存课程",
            day: 0,
            section: 0,
            weeks: [7],
            rawWeeks: "1-16周",
            classroom: "J1-101",
            teacher: "张老师",
          },
        ]),
      );
    },
    { user },
  );
}
async function routes(page: Page) {
  const captchaImage = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 94;
    c.height = 40;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f1ecfb";
    ctx.fillRect(0, 0, 94, 40);
    ctx.fillStyle = "#786294";
    ctx.font = "italic 22px serif";
    ctx.fillText("vvvv", 18, 28);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.route("**/api/jsxsd/**", (route) => {
    const url = route.request().url();
    if (url.includes("verifycode.servlet"))
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(captchaImage, "base64"),
      });
    if (url.includes("LoginToXk"))
      return route.fulfill({ body: "<div>个人中心 · 欢迎您</div>" });
    if (url.includes("grxx/xsxx"))
      return route.fulfill({
        body: "<div>姓名：林同学 学号：202601010101 学院：计算机科学与工程学院 专业：软件工程 班级：软件工程2024-1班</div>",
      });
    if (url.includes("cjcx_query"))
      return route.fulfill({ body: "成绩查询条件" });
    if (url.includes("cjcx_list")) return route.fulfill({ json: grades });
    if (url.includes("xsks/")) return route.fulfill({ json: exams });
    if (url.includes("xskb/"))
      return route.fulfill({
        body: '<table id="kbtable"><tr><th>周一</th></tr></table>',
      });
    return route.fulfill({
      body: '<script>var scode="seed";var sxh="123";</script>',
    });
  });
}
async function screenshot(page: Page, name: string) {
  if (process.env.UI_SCREENSHOT_DIR) {
    mkdirSync(process.env.UI_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: `${process.env.UI_SCREENSHOT_DIR}/${name}.png`,
      fullPage: name === "login",
    });
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date("2026-10-15T03:00:00Z"));
  await routes(page);
});

test("login has no bypass, supports password visibility and network help", async ({
  page,
}) => {
  await seed(page, null);
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "登录教务账号" }),
  ).toBeVisible();
  await expect(page.getByText(/演示|一键体验|空教室/)).toHaveCount(0);
  await page.getByLabel("教务密码", { exact: true }).fill("test-password");
  await expect(page.getByLabel("教务密码", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await page.getByRole("button", { name: "显示密码" }).click();
  await expect(page.getByLabel("教务密码", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "隐藏密码" }).click();
  await page.getByLabel("教务密码", { exact: true }).fill("");
  await page.getByRole("button", { name: /登录遇到问题/ }).click();
  await expect(page.getByText(/学校提供的 VPN/)).toBeVisible();
  await page.getByRole("button", { name: /登录遇到问题/ }).click();
  await expect(page.getByRole("button", { name: "刷新验证码" })).toBeEnabled();
  await screenshot(page, "login");
});

test("real login still reaches timetable and remains logged in after reload", async ({
  page,
}) => {
  await seed(page, null);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "刷新验证码" })).toBeEnabled();
  await page.getByLabel("学号", { exact: true }).fill(account.account);
  await page.getByLabel("教务密码", { exact: true }).fill("test-only-password");
  await page.getByLabel("验证码", { exact: true }).fill("1234");
  await page.getByRole("button", { name: "登录并进入" }).click();
  await expect(page).toHaveURL(/timetable/);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("shst_user")!).isLoggedIn,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page).toHaveURL(/timetable/);
  // Browser reload keeps the authenticated snapshot.
  expect(
    await page.evaluate(() => localStorage.getItem("shst_user")),
  ).not.toContain("test-only-password");
});

test("grades keep JSON query support, search and pass filters work", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/grade");
  await expect(page.locator(".grade-item-card")).toHaveCount(5);
  await screenshot(page, "grades");
  await page.getByRole("button", { name: "未通过", exact: true }).click();
  await expect(page.locator(".grade-item-card")).toHaveCount(1);
  await expect(page.locator(".grade-item-card")).toContainText("计算机网络");
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜索课程" }).fill("英语");
  await expect(page.locator(".grade-item-card")).toHaveCount(1);
  await page.getByRole("button", { name: "清空搜索" }).click();
  await expect(page.locator(".grade-item-card")).toHaveCount(5);
  await page.getByRole("searchbox", { name: "搜索课程" }).fill("不存在的课程");
  await expect(
    page.getByRole("heading", { name: "没有匹配的课程" }),
  ).toBeVisible();
});

test("exam shows the next upcoming exam and distinguishes completed records", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/exam");
  await expect(page.locator(".exam-card")).toHaveCount(3);
  await expect(page.locator(".nearest-banner h2")).toHaveText("数据结构与算法");
  await screenshot(page, "exams");
  await page.getByRole("button", { name: "已结束", exact: true }).click();
  await expect(page.locator(".exam-card")).toHaveCount(1);
  await expect(page.locator(".exam-card")).toContainText("大学英语");
  await page.getByRole("button", { name: "待考", exact: true }).click();
  await expect(page.locator(".exam-card")).toHaveCount(2);
});

test("profile keeps settings, has no removed entries and offers week 25", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "林同学" })).toBeVisible();
  await expect(page.getByText(/演示|空教室/)).toHaveCount(0);
  await screenshot(page, "profile");
  await page.getByRole("button", { name: /教学进度/ }).click();
  await page.getByRole("button", { name: /^25\s*周$/ }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("shst_user")!).curWeek,
    ),
  ).toBe(25);
  await page.getByRole("button", { name: /关于山科小站/ }).click();
  await expect(
    page.getByRole("dialog").filter({ has: page.locator(".about-content") }),
  ).toContainText("v1.0.14");
  await page.getByRole("button", { name: "知道了" }).click();
  await page.getByRole("button", { name: "退出当前账号", exact: true }).click();
  await page.getByRole("button", { name: "继续使用", exact: true }).click();
  await expect(page).toHaveURL(/profile/);
  await page.getByRole("button", { name: "退出当前账号", exact: true }).click();
  await page.getByRole("button", { name: "退出账号", exact: true }).click();
  await expect(page).toHaveURL(/login/);
});

test("retired preview account is migrated out with its fake caches", async ({
  page,
}) => {
  await seed(page, { ...account, isMockMode: true });
  await page.goto("/profile");
  await expect(page).toHaveURL(/login/);
  const state = await page.evaluate(() => ({
    user: localStorage.getItem("shst_user"),
    courses: localStorage.getItem("shst_timetable"),
  }));
  expect(state).toEqual({ user: null, courses: null });
});

test("removed classroom deep link cannot load a classroom screen", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/classroom");
  await expect(page).toHaveURL(/timetable/);
  await expect(page.getByText("空教室自习查询")).toHaveCount(0);
});

test("all secondary pages fit narrow phones and desktop screens without runtime errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ["/grade", "/exam", "/profile", "/login?reauth=1"]) {
      await page.goto(route);
      await page
        .locator(route.startsWith("/login") ? ".login-card" : ".screen-header")
        .waitFor();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width} ${route}`,
      ).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("unscheduled exams stay pending instead of being marked as completed", async ({
  page,
}) => {
  await seed(page);
  await page.route("**/api/jsxsd/xsks/**", (route) =>
    route.fulfill({
      json: {
        rows: [{ kcmc: "待排考课程", kssj: "待排考", js_mc: "", zwh: "" }],
      },
    }),
  );
  await page.goto("/exam");
  await expect(page.locator(".exam-total")).toHaveText("1 场待考");
  await expect(page.locator(".all-done")).toHaveCount(0);
  await expect(page.locator(".nearest-banner")).toHaveCount(0);
  await page.getByRole("button", { name: "待考", exact: true }).click();
  await expect(page.locator(".exam-card")).toContainText("时间待确认");
});
