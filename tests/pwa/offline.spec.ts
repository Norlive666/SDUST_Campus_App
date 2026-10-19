import { test, expect } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.route("**/api/jsxsd/**", route => route.abort());
});
async function ready(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
  });
}
async function seed(context) {
  await context.addInitScript(() => {
    if (localStorage.getItem("shst_user")) return;
    localStorage.setItem("shst_user", JSON.stringify({ isLoggedIn: true, account: "pwa", curTerm: "2026-2027-1", curWeek: 7,
      weekAnchor: { term: "2026-2027-1", week: 7, monday: "2026-10-12" } }));
    localStorage.setItem("shst_timetable", JSON.stringify([{ name: "离线课表课程", day: 0, section: 0, teacher: "老师", classroom: "J1", weeks: [7,8,9] }]));
    localStorage.setItem("shst_grades", JSON.stringify([{ term: "2026-2027-1", code: "001", name: "离线成绩课程", score: "92", credit: 3, gpa: 4.2, isPass: true }]));
    localStorage.setItem("shst_exams", JSON.stringify([{ term: "2026-2027-1", name: "离线考试课程", date: "2026-12-01", time: "09:00-11:00", classroom: "J1", seat: "12", isPast: false }]));
  });
}

test("production shell can close and reopen offline, advance weeks and open cached subpages", async ({ page, context }) => {
  await seed(context);
  await page.clock.setFixedTime(new Date("2026-10-18T12:00:00+08:00"));
  await page.goto("/timetable");
  await ready(page);
  await expect(page.locator(".week-title-btn")).toContainText("第 7 周");
  await context.setOffline(true);
  await page.close();
  const reopened = await context.newPage();
  await reopened.clock.setFixedTime(new Date("2026-10-19T09:00:00+08:00"));
  await reopened.goto("/timetable");
  await expect(reopened.getByText("离线课表课程", { exact: true })).toBeVisible();
  await expect(reopened.locator(".week-title-btn")).toContainText("第 8 周");
  await expect(reopened.getByRole("status")).toContainText("离线模式");
  await reopened.goto("/grade");
  await expect(reopened.getByText("离线成绩课程", { exact: true })).toBeVisible();
  await reopened.goto("/exam");
  await expect(reopened.getByText("离线考试课程", { exact: true })).toBeVisible();
  await reopened.reload();
  await expect(reopened.getByText("离线考试课程", { exact: true })).toBeVisible();
});

test("manifest icons and install help are available; web does not offer APK updates", async ({ page, context, request }) => {
  await seed(context);
  let github = 0;
  page.on("request", req => { if (req.url().includes("api.github.com")) github++; });
  await page.goto("/profile"); await ready(page);
  const response = await request.get("/manifest.webmanifest");
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  await expect(page.getByText("已可离线打开，断网可查看缓存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /添加到桌面/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Safari");
  await page.getByRole("button", { name: "知道了", exact: true }).click();
  await page.getByRole("button", { name: /检查更新/ }).click();
  await expect(page.locator(".download-link")).toHaveCount(0);
  expect(github).toBe(0);
});

test("service worker caches no school responses and never serves the SPA for API failures", async ({ page, context }) => {
  await page.goto("/login"); await ready(page);
  const urls = await page.evaluate(async () => {
    const result: string[] = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) result.push(req.url);
    return result;
  });
  expect(urls.some(url => url.endsWith("/index.html"))).toBe(true);
  expect(urls.some(url => url.includes("/api/"))).toBe(false);
  await context.setOffline(true);
  const response = await page.evaluate(async () => {
    try { return await (await fetch("/api/jsxsd/xskb/xskb_list.do", { method: "POST" })).text(); }
    catch (_) { return "offline-request-failed"; }
  });
  expect(response).toBe("offline-request-failed");
  await page.reload();
  await expect(page.getByLabel("学号", { exact: true })).toBeVisible();
});

test("a newly deployed shell prompts for refresh and keeps cached user data", async ({ page, context }) => {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const worker = readFileSync("dist/sw.js", "utf8");
  await seed(context);
  await page.goto("/profile"); await ready(page);
  try {
    writeFileSync("dist/sw.js", worker.replace(/shst-shell-([a-f0-9]+)/, "shst-shell-$1-test-update"));
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect(page.getByRole("status")).toContainText("网页有新版本");
    await page.getByRole("button", { name: "立即刷新", exact: true }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByText("已可离线打开，断网可查看缓存", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("shst_user")!).account)).toBe("pwa");
  } finally { writeFileSync("dist/sw.js", worker); }
});
