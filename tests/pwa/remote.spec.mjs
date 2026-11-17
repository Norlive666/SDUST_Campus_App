import { once } from "node:events";
import { createServer } from "node:http";
import { test, expect } from "@playwright/test";
import { makeRemoteLan } from "../../server/remote-lan.mjs";

test("未登录且教务接口不可用时，仍可从登录页进入遥控器", async ({ page, context }) => {
  await context.route("**/api/jsxsd/**", route => route.abort());
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登录教务账号" })).toBeVisible();
  await page.getByRole("link", { name: "遥控器（免登录）" }).click();
  await expect(page).toHaveURL(/\/remote-control\.html$/);
  await expect(page.getByRole("heading", { name: "遥控器", exact: true })).toBeVisible();
});

test("课表入口打开独立遥控页，普通浏览器可切到局域网入口", async ({ page, context }) => {
  await context.route("**/api/jsxsd/**", route => route.abort());
  await context.addInitScript(() => {
    localStorage.setItem("shst_user", JSON.stringify({ isLoggedIn: true, account: "pwa", curTerm: "2026-2027-1", curWeek: 7 }));
    Object.defineProperty(navigator, "bluetooth", { value: undefined });
  });
  await page.goto("/timetable");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
  });
  await context.setOffline(true);
  await page.getByRole("link", { name: "遥控器" }).click();
  await expect(page).toHaveURL(/\/remote-control\.html$/);
  await expect(page.getByRole("heading", { name: "遥控器" })).toBeVisible();
  await page.getByRole("button", { name: "功能选项" }).click();
  await page.getByRole("button", { name: "连接与后台" }).click();
  await expect(page.getByLabel("遥控页地址")).toHaveValue(/remote-control\.html$/);
  await page.getByLabel("连接方式").selectOption("lan");
  await expect(page.getByLabel("电脑的局域网调试地址")).toBeVisible();
  await expect(page.getByLabel("网页调试令牌")).toHaveCount(0);
});

test("配置自定义控件可持久化，编辑布局时保持未使能", async ({ page }) => {
  await page.goto("/remote-control.html");
  await page.getByRole("button", { name: "功能选项" }).click();
  await page.getByRole("button", { name: "自定义控件" }).click();
  await page.getByRole("button", { name: "添加控件" }).click();
  const third = page.getByRole("group", { name: "控件 3" });
  await third.getByLabel("名称").fill("第三通道");
  await third.getByLabel("类型").selectOption("cycle");
  await third.getByLabel("循环值").fill("2,2");
  await page.getByRole("button", { name: "应用设置" }).click();
  await expect(page.getByRole("alert")).toContainText("互不重复");
  await third.getByLabel("循环值").fill("0,2,5");
  await page.getByRole("button", { name: "应用设置" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "第三通道" })).toBeVisible();
  await page.getByRole("button", { name: "功能选项" }).click();
  await page.getByRole("button", { name: "编辑布局" }).click();
  await expect(page.getByRole("switch", { name: "使能" })).toBeDisabled();
  await page.getByLabel("选中控件").selectOption({ label: "第三通道" });
  await page.locator(".edit-bar input[type=range]").fill("125");
  await page.getByRole("button", { name: "保存布局" }).click();
  const scale = await page.getByRole("button", { name: "第三通道" }).locator("..").getAttribute("style");
  expect(scale).toContain("scale(1.25)");
});

test("横屏设置完整显示，蓝色摇杆可独立向下移动和缩小", async ({ page }) => {
  await page.setViewportSize({ width: 852, height: 393 });
  await page.goto("/remote-control.html");
  await page.getByRole("button", { name: "左摇杆方向：自由" }).click();
  await expect(page.getByRole("button", { name: "左摇杆方向：仅横向" })).toBeVisible();
  await page.getByRole("button", { name: "功能选项" }).click();
  await expect(page.getByRole("group", { name: "右摇杆" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "应用设置" })).toBeInViewport();
  await page.getByRole("button", { name: "编辑布局" }).click();
  const pad = page.getByLabel("左摇杆操控区");
  const card = page.locator(".stick-card").first();
  await expect(pad).toBeVisible();
  const cardBefore = await card.boundingBox();
  const padBefore = await pad.boundingBox();
  const x = padBefore.x + padBefore.width / 2;
  const y = padBefore.y + padBefore.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 36, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await pad.boundingBox()).y - padBefore.y).toBeGreaterThan(30);
  expect(await card.boundingBox()).toEqual(cardBefore);
  await page.locator(".edit-bar input[type=range]").fill("50");
  await expect.poll(async () => (await pad.boundingBox()).width).toBeCloseTo(padBefore.width / 2, 0);
  await page.getByRole("button", { name: "保存布局" }).click();
  await page.reload();
  await expect(pad).toHaveAttribute("style", /scale\(0.5\)/);
});

test("蓝牙向 FFF2 串行发帧，关闭使能清零，断开后停发并可快捷重连", async ({ page }) => {
  await page.addInitScript(() => {
    const output = window.rcTest = { frames: [], pending: 0, overlap: false, requested: [], picked: 0 };
    const device = Object.assign(new EventTarget(), { id: "bt630-id", name: "BT630-test", gatt: null });
    output.drop = () => device.gatt.disconnect();
    const tx = Object.assign(new EventTarget(), {
      properties: { write: true, writeWithoutResponse: false },
      async writeValue(frame) {
        if (output.pending++) output.overlap = true;
        await new Promise(resolve => setTimeout(resolve, 4));
        output.frames.push([...frame]);
        output.pending--;
      },
    });
    device.gatt = {
      connected: false,
      async connect() { this.connected = true; return this; },
      disconnect() { this.connected = false; device.dispatchEvent(new Event("gattserverdisconnected")); },
      async getPrimaryService(uuid) {
        output.requested.push(uuid);
        return { async getCharacteristic(uuid) {
          output.requested.push(uuid);
          if (uuid.includes("fff2")) return tx;
          return Object.assign(new EventTarget(), { properties: { notify: true }, async startNotifications() { return this; } });
        } };
      },
    };
    Object.defineProperty(navigator, "bluetooth", { value: {
      requestDevice: async () => { output.picked++; return device; }, getDevices: async () => [device],
    } });
  });
  await page.goto("/remote-control.html");
  await page.getByRole("button", { name: "连接", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("BT630-test");
  await expect.poll(() => page.evaluate(() => window.rcTest.frames[0]?.[17])).toBe(0);
  await page.getByRole("switch", { name: "使能" }).click();
  const stick = page.getByLabel("左摇杆操控区");
  const box = await stick.boundingBox();
  await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.4);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.rcTest.frames.some(f => f[17] === 1 && f[5] > 0))).toBe(true);
  await page.mouse.up();
  await page.getByRole("switch", { name: "使能" }).click();
  await expect.poll(() => page.evaluate(() => window.rcTest.frames.at(-1).slice(4, 18))).toEqual(Array(14).fill(0));
  await page.getByRole("button", { name: "断开", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("未连接");
  const state = await page.evaluate(() => window.rcTest);
  expect(state.requested.map(s => s.slice(4, 8))).toEqual(["fff0", "fff2", "fff1"]);
  expect(state.frames.at(-1)[17]).toBe(2);
  expect(state.overlap).toBe(false);
  await page.reload();
  await expect(page.getByRole("button", { name: "连接", exact: true })).toContainText("BT630-test");
  await page.getByRole("button", { name: "连接", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已连接");
  expect(await page.evaluate(() => window.rcTest.picked)).toBe(0);
  await page.getByRole("switch", { name: "使能" }).click();
  await page.evaluate(() => window.rcTest.drop());
  await expect(page.getByRole("status")).toContainText("重试");
  await expect(page.getByRole("status")).toContainText("已连接");
  await expect(page.getByRole("switch", { name: "使能" })).not.toBeChecked();
});

test("局域网浏览器校验令牌与回读，异常后解除使能", async ({ page, request }) => {
  const frames = [];
  let verified = false;
  const upstream = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/health") return res.end(JSON.stringify({ write_enabled: true, symbol: "g_rc", address: 0x20000000 }));
    if (req.url === "/api/state") return res.end(JSON.stringify({ values: { enabled: 0 } }));
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    frames.push(Buffer.concat(chunks));
    res.end(JSON.stringify({ ok: true, verified, ms: 1 }));
  });
  upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
  const bridge = makeRemoteLan({ secret: "test-token", upstreamPort: upstream.address().port });
  bridge.listen(0, "127.0.0.1"); await once(bridge, "listening");
  const url = `http://127.0.0.1:${bridge.address().port}`;
  try {
    expect((await request.get(`${url}/rc-tune/health`)).status()).toBe(401);
    expect((await request.post(`${url}/rc-tune/frame`, {
      headers: { Origin: "https://not-the-page.invalid", "X-Token": "test-token", "Content-Type": "application/octet-stream" },
      data: Buffer.alloc(20),
    })).status()).toBe(403);
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "遥控器" })).toBeVisible();
    await page.getByRole("button", { name: "连接", exact: true }).click();
    await page.getByLabel("网页调试令牌").fill("test-token");
    await page.getByRole("group", { name: "调试链路" }).getByRole("button", { name: "连接", exact: true }).click();
    await page.getByRole("button", { name: "关闭设置" }).click();
    await expect(page.getByRole("status")).toContainText("探针回读不一致");
    await expect(page.getByRole("switch", { name: "使能" })).toBeDisabled();
    verified = true;
    await page.getByRole("button", { name: "连接", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("g_rc");
    await expect.poll(() => frames.some(f => f.length === 20 && f[17] === 0)).toBe(true);
    await page.getByRole("switch", { name: "使能" }).click();
    await expect.poll(() => frames.some(f => f[17] === 1)).toBe(true);
    verified = false;
    await expect(page.getByRole("status")).toContainText("探针回读不一致");
    await expect(page.getByRole("switch", { name: "使能" })).toBeDisabled();
    const sent = frames.length;
    await expect.poll(() => frames.length).toBe(sent);
  } finally {
    bridge.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise(resolve => bridge.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
  }
});
