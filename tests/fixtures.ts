import { test as base } from "@playwright/test";
// All tests control the update endpoint; never depend on a real public release.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("https://api.github.com/repos/Norlive666/SDUST_Campus_App/releases/latest", route => route.fulfill({ status: 404, json: {} }));
    await use(page);
  },
});
export { expect, type Page } from "@playwright/test";
