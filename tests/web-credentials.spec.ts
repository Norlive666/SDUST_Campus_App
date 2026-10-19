import { test, expect } from "./fixtures";
test("web credentials survive reload encrypted, and logout removes them", async ({ page }) => {
  await page.route("**/api/jsxsd/**", route => route.abort());
  await page.goto("/login");
  const stored = await page.evaluate(async () => {
    // @ts-ignore browser application module.
    const { credentials } = await import("/src/services/credentials.ts");
    await credentials.save({ account: "student", password: "pwa-secret-test" });
    return await new Promise<any>((resolve, reject) => {
      const request = indexedDB.open("sdust-private", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, read = db.transaction("vault").objectStore("vault").get("credentials");
        read.onsuccess = () => { resolve({ extractable: read.result.key.extractable, hasCipher: !!read.result.cipher,
          json: JSON.stringify(read.result), storage: JSON.stringify(localStorage) }); db.close(); };
      };
    });
  });
  expect(stored.extractable).toBe(false); expect(stored.hasCipher).toBe(true);
  expect(stored.json).not.toContain("pwa-secret-test"); expect(stored.storage).not.toContain("pwa-secret-test");
  await page.reload();
  expect(await page.evaluate(async () => {
    // @ts-ignore browser application module.
    return (await import("/src/services/credentials.ts")).credentials.read();
  })).toEqual({ account: "student", password: "pwa-secret-test" });
  await page.evaluate(async () => {
    // @ts-ignore browser application module.
    const { credentials } = await import("/src/services/credentials.ts");
    await credentials.clear();
  });
  await page.reload();
  expect(await page.evaluate(async () => {
    // @ts-ignore browser application module.
    return (await import("/src/services/credentials.ts")).credentials.read();
  })).toBeNull();
});

test("offline session clearing retries before the next web query", async ({ page, context }) => {
  await page.route("**/api/jsxsd/**", route => route.abort());
  await page.goto("/login");
  await context.setOffline(true);
  await page.evaluate(async () => {
    // @ts-ignore browser application module.
    await (await import("/src/services/http.ts")).http.clearCookie();
  });
  expect(await page.evaluate(() => localStorage.getItem("sdust_pending_session_clear"))).toBe("1");
  await context.setOffline(false);
  const calls: string[] = [];
  await page.route("**/api/jsxsd/**", route => {
    calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ body: "ok" });
  });
  await page.evaluate(async () => {
    // @ts-ignore browser application module.
    await (await import("/src/services/http.ts")).http.request({ url: "xskb/xskb_list.do" });
  });
  expect(calls).toEqual(["DELETE /api/jsxsd/__session", "GET /api/jsxsd/xskb/xskb_list.do"]);
  expect(await page.evaluate(() => localStorage.getItem("sdust_pending_session_clear"))).toBeNull();
});
