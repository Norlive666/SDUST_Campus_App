import { test, expect } from "./fixtures";
test("widget receives only offline course data and handles logout/cache clearing", async ({ page }) => {
  await page.route("**/api/jsxsd/**", route => route.abort());
  await page.goto("/login");
  const result = await page.evaluate(async () => {
    // @ts-ignore Vite integration module.
    const { makeWidgetSnapshot, syncTimetableWidget, requestTimetableWidget } = await import("/src/services/timetable-widget.ts");
    const user = { isLoggedIn: true, password: "never-send-this", account: "private-id", weekAnchor: { term: "2026-2027-1", week: 8, monday: "2026-10-19" } };
    const courses = [{ name: "课程", classroom: "J1-101", day: 0, section: 0, teacher: "老师", weeks: [8, 0, 26, "9"] }, { name: "错误课程", day: 9, section: 0, weeks: [8] }];
    const snapshot = makeWidgetSnapshot(user, courses, true);
    await syncTimetableWidget(snapshot); // Web/PWA does not invoke native plugins.
    return { snapshot, logout: makeWidgetSnapshot({ ...user, isLoggedIn: false }, courses, true), clear: makeWidgetSnapshot(user, courses, false), pin: await requestTimetableWidget() };
  });
  expect(result.snapshot).toEqual({ loggedIn: true, hasCache: true, weekAnchor: { week: 8, monday: "2026-10-19" }, courses: [{ name: "课程", room: "J1-101", day: 0, section: 0, weeks: [8] }] });
  expect(JSON.stringify(result.snapshot)).not.toContain("never-send-this");
  expect(JSON.stringify(result.snapshot)).not.toContain("private-id");
  expect(result.logout).toEqual({ loggedIn: false, hasCache: false, weekAnchor: null, courses: [] });
  expect(result.clear.courses).toEqual([]); expect(result.clear.hasCache).toBe(false);
  expect(result.pin).toEqual({ supported: false, requested: false });
  await expect(page.getByText("添加桌面课表小部件", { exact: true })).toHaveCount(0);
});
