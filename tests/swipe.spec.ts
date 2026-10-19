import { test, expect, type Page } from "./fixtures";

test.use({ timezoneId: "Asia/Shanghai", hasTouch: true, viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-19T12:00:00+08:00") });
  await page.addInitScript(() => {
    localStorage.setItem("shst_user", JSON.stringify({
      isLoggedIn: true, account: "swipe-test", curTerm: "2026-2027-1", curWeek: 8,
      weekAnchor: { term: "2026-2027-1", week: 8, monday: "2026-10-19" },
    }));
    localStorage.setItem("shst_timetable", JSON.stringify(Array.from({ length: 7 }, (_, day) => ({
      name: `星期${day + 1}课程`, day, section: 0, teacher: "老师", classroom: "J1",
      rawWeeks: "1-25周", weeks: Array.from({ length: 25 }, (_, n) => n + 1),
    }))));
  });
  await page.route("**/api/jsxsd/**", route => route.abort());
  await page.goto("/timetable");
});

async function swipe(page: Page, dx: number, dy = 0, options: { cancel?: boolean; multi?: boolean; card?: boolean } = {}) {
  return page.locator(options.card ? ".agenda-card" : ".schedule-swipe").first().evaluate((el, { dx, dy, options }) => {
    const point = (x: number, y: number, identifier = 1) => new Touch({ identifier, target: el, clientX: x, clientY: y });
    const start = point(190, 200);
    const finish = point(190 + dx, 200 + dy);
    const send = (type: string, touches: Touch[], changedTouches: Touch[]) => {
      const event = new TouchEvent(type, { bubbles: true, cancelable: true, touches, targetTouches: touches, changedTouches });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    };
    send("touchstart", [start], [start]);
    const prevented = send("touchmove", options.multi ? [finish, point(100, 100, 2)] : [finish], [finish]);
    send(options.cancel ? "touchcancel" : "touchend", [], [finish]);
    return prevented;
  }, { dx, dy, options });
}
const title = (page: Page) => page.locator(".week-title-btn");

async function chooseWeek(page: Page, week: number) {
  await title(page).click();
  await page.locator(".week-chip").filter({ hasText: new RegExp(`^${week}$`) }).click();
  await expect(page.locator(".week-grid-container")).toBeHidden();
}

test("week swipes navigate one week per gesture in both directions", async ({ page }) => {
  await page.getByRole("button", { name: "周课表", exact: true }).click();
  expect(await swipe(page, -120)).toBe(true);
  await expect(title(page)).toContainText("第 9 周");
  await expect(title(page)).toContainText("10/26 — 11/01");
  await swipe(page, 120);
  await expect(title(page)).toContainText("第 8 周");
});

test("agenda swipes change the day and cross weeks in both directions", async ({ page }) => {
  await expect(page.locator(".agenda-card")).toContainText("星期1课程");
  await swipe(page, -120);
  await expect(page.locator(".agenda-card")).toContainText("星期2课程");
  await swipe(page, 120);
  await expect(page.locator(".day-heading")).toContainText("今日安排");
  await swipe(page, 120);
  await expect(title(page)).toContainText("第 7 周");
  await expect(page.locator(".day-selector button.selected")).toContainText("周日");
  await expect(page.locator(".agenda-card")).toContainText("星期7课程");
  await swipe(page, -120);
  await expect(title(page)).toContainText("第 8 周");
  await expect(page.locator(".day-heading")).toContainText("今日安排");
});

test("vertical scroll, short drags, cancelled and multi-touch gestures do not navigate", async ({ page }) => {
  expect(await swipe(page, 10, -120)).toBe(false);
  await swipe(page, 25);
  await swipe(page, -120, 0, { cancel: true });
  await swipe(page, -120, 0, { multi: true });
  await expect(title(page)).toContainText("第 8 周");
  await expect(page.locator(".day-heading")).toContainText("今日安排");
});

test("dragging a course suppresses accidental opening while ordinary taps still work", async ({ page }) => {
  await swipe(page, -120, 0, { card: true });
  await page.locator(".agenda-card").dispatchEvent("click", { detail: 1 });
  await expect(page.getByRole("dialog")).toBeHidden();
  // A fresh intentional tap must work immediately after a swipe.
  await page.locator(".agenda-card").tap();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("first and last teaching week/day boundaries cannot be exceeded", async ({ page }) => {
  await chooseWeek(page, 1);
  await swipe(page, 120);
  await expect(title(page)).toContainText("第 1 周");
  await expect(page.locator(".day-selector button.selected")).toContainText("周一");
  await chooseWeek(page, 25);
  await page.locator(".day-selector button").last().click();
  await swipe(page, -120);
  await expect(title(page)).toContainText("第 25 周");
  await expect(page.locator(".day-selector button.selected")).toContainText("周日");
  await page.getByRole("button", { name: "周课表", exact: true }).click();
  await swipe(page, -120);
  await expect(title(page)).toContainText("第 25 周");
});

test("browser-generated touch input switches weeks without opening a course", async ({ page }) => {
  await page.getByRole("button", { name: "周课表", exact: true }).click();
  const board = await page.locator(".week-board").boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const y = Math.min(board!.y + 140, 600);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 280, y }] });
  for (const x of [250, 220, 190, 160, 130, 100]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(title(page)).toContainText("第 9 周");
  await expect(page.getByRole("dialog")).toBeHidden();
  await cdp.detach();
});
