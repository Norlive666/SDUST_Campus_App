import { test, expect } from "./fixtures";

test("Android notification setting persists, explains blocked permission and opens timetable", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("shst_user")) localStorage.setItem("shst_user", JSON.stringify({ isLoggedIn: true, account: "test", curTerm: "2026-2027-1", curWeek: 8, weekAnchor: { term: "2026-2027-1", week: 8, monday: "2026-10-19" } }));
    localStorage.setItem("shst_timetable", "[]");
    const win = window as any;
    win.CapacitorCustomPlatform = { name: "android" };
    win.notificationCalls = [];
    win.openFromNotification = false;
    win.Capacitor = {
      PluginHeaders: [
        { name: "TimetableNotification", methods: ["status", "initialize", "configure", "openSettings", "consumeOpen"].map(name => ({ name, rtype: "promise" })) },
        { name: "TimetableWidget", methods: [{ name: "update", rtype: "promise" }] },
      ],
      nativePromise: async (plugin: string, method: string, options: any) => {
        if (plugin === "TimetableWidget") return {};
        win.notificationCalls.push(method);
        if (method === "consumeOpen") {
          const open = win.openFromNotification; win.openFromNotification = false; return { open };
        }
        if (method === "configure") localStorage.setItem("test_notification_enabled", String(options.enabled));
        return { enabled: localStorage.getItem("test_notification_enabled") !== "false", allowed: false };
      },
    };
  });
  await page.route("**/api/jsxsd/**", route => route.abort());
  await page.goto("/profile");
  const toggle = page.getByRole("switch", { name: "锁屏课表通知" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("开关已开启，需允许系统通知权限")).toBeVisible();
  await page.getByRole("button", { name: /锁屏显示设置/ }).click();
  expect(await page.evaluate(() => (window as any).notificationCalls)).toContain("openSettings");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.evaluate(() => {
    (window as any).openFromNotification = true;
    window.dispatchEvent(new Event("timetable-notification-open"));
  });
  await expect(page).toHaveURL(/\/timetable$/);
});

test("web version does not expose or call Android notification controls", async ({ page }) => {
  await page.goto("/login");
  const supported = await page.evaluate(async () => {
    // @ts-ignore Vite source module
    const service = await import("/src/services/timetable-notification.ts");
    await service.initializeTimetableNotification();
    await service.refreshNotificationStatus();
    await service.setTimetableNotification(true);
    return service.supportsTimetableNotification();
  });
  expect(supported).toBe(false);
  await expect(page.getByRole("switch", { name: "锁屏课表通知" })).toHaveCount(0);
});
