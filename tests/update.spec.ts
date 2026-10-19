import { test, expect, type Page } from "./fixtures";
import { version } from "../package.json";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/jsxsd/**", route => route.abort());
});

const api = "https://api.github.com/repos/Norlive666/SDUST_Campus_App/releases/latest";
const releases = "https://github.com/Norlive666/SDUST_Campus_App/releases";
const release = (tag = "v99.0.0") => ({
  tag_name: tag, draft: false, prerelease: false,
  html_url: `${releases}/tag/${tag}`, body: "修复周次计算\n新增左右滑动切换",
  assets: [
    { name: "Campus.apk", state: "uploaded", browser_download_url: `${releases}/download/${tag}/Campus.apk` },
    { name: "Campus.ipa", state: "uploaded", browser_download_url: `${releases}/download/${tag}/Campus.ipa` },
  ],
});

test("APK update check detects newer release and displays notes, current version and correct download links", async ({ page }) => {
  await page.route(api, route => route.fulfill({ json: release() }));
  await page.goto("/login");
  await requestUpdate(page);
  const dialog = page.getByRole("dialog").filter({ hasText: "发现新版本" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("发现新版本");
  await expect(dialog).toContainText(`v${version}`);
  await expect(dialog).toContainText("v99.0.0");
  await expect(dialog).toContainText("新增左右滑动切换");
  await expect(dialog.getByRole("link", { name: /下载 Android/ })).toHaveAttribute("href", `${releases}/download/v99.0.0/Campus.apk`);
  await expect(dialog.getByRole("link", { name: /GitHub 发布页/ })).toHaveAttribute("href", `${releases}/tag/v99.0.0`);
  await dialog.getByRole("button", { name: "稍后再说" }).click();
  await expect(dialog).toBeHidden();
  await page.getByLabel("学号", { exact: true }).fill("student");
});

test("same/older versions and prereleases never prompt", async ({ page }) => {
  for (const item of [release(`v${version}`), release("v0.1.0"), { ...release(), prerelease: true }, { ...release(), draft: true }]) {
    await page.route(api, route => route.fulfill({ json: item }));
    await page.goto("/login");
  await requestUpdate(page);
    await expect.poll(() => page.evaluate(async () => {
      // @ts-ignore Vite module served in browser.
      const { useUpdateStore } = await import("/src/stores/update.ts");
      return useUpdateStore().checking;
    })).toBe(false);
    await expect(page.getByRole("dialog").filter({ hasText: "发现新版本" })).toBeHidden();
  }
});

test("APK check errors, rate limits and malformed responses are silent and preserve login UI", async ({ page }) => {
  for (const scenario of ["offline", "rate-limit", "invalid", "missing"]) {
    await page.route(api, route => scenario === "offline" ? route.abort() : route.fulfill({
      status: scenario === "rate-limit" ? 403 : scenario === "missing" ? 404 : 200,
      json: { message: "unavailable" },
    }));
    await page.goto("/login");
  await requestUpdate(page);
    await expect.poll(() => page.evaluate(async () => {
      // @ts-ignore Vite module served in browser.
      const { useUpdateStore } = await import("/src/stores/update.ts");
      return useUpdateStore().checking;
    })).toBe(false);
    await expect(page.getByRole("dialog").filter({ hasText: "发现新版本" })).toBeHidden();
    await expect(page.locator(".van-toast")).toBeHidden();
    await expect(page.getByLabel("教务密码", { exact: true })).toBeVisible();
  }
});

test("manual APK update check can retry after failure and reopen a postponed update", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("shst_user", JSON.stringify({ isLoggedIn: true, account: "updates", curTerm: "2026-2027-1", curWeek: 8 })));
  await page.goto("/profile");
  const button = page.getByRole("button", { name: /检查更新/ });
  await expect(button).toBeEnabled();
  await page.route(api, route => route.abort());
  await requestUpdate(page, true);
  await expect(page.locator(".van-toast")).toContainText("检查更新失败");
  await expect(button).toBeEnabled();
  await page.route(api, route => route.fulfill({ json: release() }));
  await requestUpdate(page, true);
  await expect(page.getByRole("dialog").filter({ hasText: "发现新版本" })).toBeVisible();
  await page.getByRole("button", { name: "稍后再说" }).click();
  await expect(page.getByRole("dialog").filter({ hasText: "发现新版本" })).toBeHidden();
  await requestUpdate(page, true);
  await expect(page.getByRole("dialog").filter({ hasText: "发现新版本" })).toBeVisible();
});

test("no matching downloadable asset falls back to the release page", async ({ page }) => {
  await page.route(api, route => route.fulfill({ json: { ...release(), assets: [release().assets[1]] } }));
  await page.goto("/login");
  await requestUpdate(page);
  await expect(page.getByRole("dialog").filter({ hasText: "发现新版本" })).toBeVisible();
  await expect(page.locator(".download-link")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /GitHub 发布页/ })).toHaveAttribute("href", `${releases}/tag/v99.0.0`);
});

test("numeric version comparison, APK selection and unsafe/multiple asset fallback", async ({ page }) => {
  await page.goto("/login");
  await requestUpdate(page);
  const result = await page.evaluate(async (release) => {
    // @ts-ignore Vite module served in browser.
    const { isNewerVersion, parseRelease } = await import("/src/services/app-update.ts");
    return {
      newer: isNewerVersion("v1.0.10", "1.0.9"), older: isNewerVersion("v1.0.9", "1.0.10"),
      equal: isNewerVersion("v1.0.0", "1.0"), bad: isNewerVersion("preview", "1.0.1"),
      android: parseRelease(release, "1.0.15"),
      unsafe: parseRelease({ ...release, html_url: "javascript:alert(1)", assets: [{ ...release.assets[0], browser_download_url: "https://example.com/other.apk" }] }, "1.0.15"),
      split: parseRelease({ ...release, assets: [{ ...release.assets[0], name: "arm64.apk" }, { ...release.assets[0], name: "arm32.apk" }] }, "1.0.15"),
    };
  }, release());
  expect(result.newer).toBe(true); expect(result.older).toBe(false);
  expect(result.equal).toBe(false); expect(result.bad).toBe(false);
  expect(result.android.downloadUrl).toMatch(/Campus\.apk$/);
  expect(result.unsafe.downloadUrl).toBeNull(); expect(result.unsafe.releaseUrl).toBe(releases);
  expect(result.split.downloadUrl).toBeNull();
});

test("opening a browser download uses the asset link and checks do not repeat on window focus", async ({ page }) => {
  let count = 0;
  await page.route(api, route => { count++; return route.fulfill({ json: release() }); });
  await page.context().route(`${releases}/download/**`, route => route.fulfill({ body: "download entry" }));
  await page.goto("/login");
  await requestUpdate(page);
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: /下载 Android/ }).click();
  const downloadPage = await popup;
  await expect(downloadPage).toHaveURL(`${releases}/download/v99.0.0/Campus.apk`);
  await downloadPage.close();
  await page.getByRole("button", { name: "稍后再说" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(count).toBe(1);
});

async function requestUpdate(page: Page, manual = false) {
  await page.evaluate(async (manual) => {
    // @ts-ignore Vite application module for Android update service integration.
    const { useUpdateStore } = await import("/src/stores/update.ts");
    await useUpdateStore().check(manual);
  }, manual);
}
