import { test, expect, type Page } from "./fixtures";

// These fixtures deliberately span a Sunday/Monday boundary in China time.
test.use({ timezoneId: "Asia/Shanghai" });
const course = {
  name: "第八周课程", day: 0, section: 0, teacher: "老师", classroom: "J1",
  rawWeeks: "8周", weeks: [8],
};
async function seed(page: Page, anchor: boolean = true) {
  await page.addInitScript(({ course, anchor }) => {
    if (localStorage.getItem("shst_user")) return;
    localStorage.setItem("shst_user", JSON.stringify({
      isLoggedIn: true, account: "week-test", curTerm: "2026-2027-1", curWeek: 7,
      ...(anchor ? { weekAnchor: { term: "2026-2027-1", week: 7, monday: "2026-10-12" } } : {}),
    }));
    localStorage.setItem("shst_timetable", JSON.stringify([course]));
  }, { course, anchor });
  await page.route("**/api/jsxsd/**", route => route.abort());
}
const title = (page: Page) => page.locator(".week-title-btn");

test("legacy saved week 7 migrates to week 8 on Monday without clearing login/cache", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-19T00:01:00+08:00"));
  await seed(page, false);
  await page.goto("/timetable");
  await expect(title(page)).toContainText("第 8 周");
  await expect(title(page)).toContainText("10/19 — 10/25");
  await expect(page.getByText("第八周课程", { exact: true })).toBeVisible();
  await page.reload();
  await expect(title(page)).toContainText("第 8 周");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("shst_user")!).isLoggedIn)).toBe(true);
});

test("reopening after Sunday advances one week, and after two weeks advances two", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-18T23:59:00+08:00"));
  await seed(page);
  await page.goto("/timetable");
  await expect(title(page)).toContainText("第 7 周");
  await page.clock.setFixedTime(new Date("2026-10-19T00:01:00+08:00"));
  await page.reload();
  await expect(title(page)).toContainText("第 8 周");
  await page.clock.setFixedTime(new Date("2026-10-26T09:00:00+08:00"));
  await page.reload();
  await expect(title(page)).toContainText("第 9 周");
});

test("open screen updates week, date and Monday courses across midnight", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-18T23:59:45+08:00") });
  await seed(page);
  await page.goto("/timetable");
  await expect(title(page)).toContainText("第 7 周");
  await page.clock.fastForward(30_000);
  await expect(title(page)).toContainText("第 8 周");
  await expect(title(page)).toContainText("10/19 — 10/25");
  await expect(page.getByText("第八周课程", { exact: true })).toBeVisible();
});

test("resume updates current week while preserving a week being browsed", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-18T12:00:00+08:00"));
  await seed(page);
  await page.goto("/timetable");
  await page.getByRole("button", { name: "上一周", exact: true }).click();
  await expect(title(page)).toContainText("第 6 周");
  await page.clock.setFixedTime(new Date("2026-10-19T08:00:00+08:00"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(title(page)).toContainText("第 6 周");
  await page.getByRole("button", { name: "本周", exact: true }).click();
  await expect(title(page)).toContainText("第 8 周");
});

test("manual calibration persists and continues advancing; stale query week cannot undo it", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-18T12:00:00+08:00"));
  await seed(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: /教学进度/ }).click();
  await page.getByRole("button", { name: /^10\s*周$/ }).click();
  await page.clock.setFixedTime(new Date("2026-10-19T08:00:00+08:00"));
  await page.goto("/timetable");
  await expect(title(page)).toContainText("第 11 周");
  await page.route("**/api/jsxsd/**", route => route.fulfill({ body:
    '<select name="zc"><option selected value="7">第七周</option></select><table id="kbtable"><tr><th>周一</th></tr></table>' }));
  await page.getByRole("button", { name: "同步课表" }).click();
  await expect(page.getByRole("button", { name: "同步课表" })).toBeEnabled();
  await expect(title(page)).toContainText("第 11 周");
  await page.reload();
  await expect(title(page)).toContainText("第 11 周");
});

test("calendar arithmetic handles month/year boundaries, limits and invalid anchors", async () => {
  const { weekFromAnchor } = await import("../src/services/teaching-week");
  const anchor = { week: 7, monday: "2026-12-28" };
  expect(weekFromAnchor(anchor, new Date("2027-01-03T12:00:00"))).toBe(7);
  expect(weekFromAnchor(anchor, new Date("2027-01-04T00:00:00"))).toBe(8);
  expect(weekFromAnchor(anchor, new Date("2027-02-01T12:00:00"))).toBe(12);
  expect(weekFromAnchor({ week: 25, monday: "2026-12-28" }, new Date("2027-01-04T12:00:00"))).toBe(25);
  expect(weekFromAnchor({ week: 7, monday: "2026-02-30" }, new Date())).toBeNull();
  expect(weekFromAnchor({ week: 7, monday: "2026-10-18" }, new Date())).toBeNull();
});
