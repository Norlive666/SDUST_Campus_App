import { test, expect } from "./fixtures";

async function open(page) {
  await page.addInitScript(() => localStorage.setItem("shst_user", JSON.stringify({
    isLoggedIn: true, account: "grade-regression", curTerm: "2026-2027-1",
  })));
  await page.route("**/api/jsxsd/**", route => route.abort());
  await page.goto("/profile");
}

test("JSON retains all remarks and separate deferred/makeup result columns", async ({ page }) => {
  await open(page);
  const rows = await page.evaluate(async () => {
    // @ts-ignore Vite source modules
    const { parseGradesJson } = await import("/src/services/parser.ts");
    return parseGradesJson({ rows: [
      { kcmc: "缓考备注", zcj: "0", cjbzmc: "正常", bz: "缓考" },
      { kcmc: "补考待录", zcj: "0", ksxzmc: "补考", cjbzmc: "正常", bz: "尚未录入" },
      { kcmc: "缓考已出", zcj: "0", ksxzmc: "缓考", hkcj: "76" },
      { kcmc: "重修已出", zcj: "45", ksxzmc: "重修", bkcj: "0", cxcj: "81" },
      { kcmc: "免修备注", zcj: "0", cjbzmc: "正常", bz: "免修" },
      { kcmc: "补考尚未公布", zcj: "成绩未公布", ksxzmc: "补考" },
    ] });
  });
  expect(rows.map(r => r.status)).toEqual(["pending", "pending", "pass", "pass", "exempt", "pending"]);
  expect(rows.map(r => r.score)).toEqual(["缓考", "补考", "76", "81", "免修", "补考"]);
});

test("HTML reads special markers from result-cell titles and supports distinct extra columns", async ({ page }) => {
  await open(page);
  const rows = await page.evaluate(async () => {
    // @ts-ignore
    const { parseGradesHtml } = await import("/src/services/parser.ts");
    return parseGradesHtml(`<table id="dataList"><tr><th>课程名称</th><th>总评成绩</th><th>补考成绩</th><th>缓考成绩</th><th>成绩备注</th><th>学分</th></tr>
      <tr><td>标题缓考</td><td><a title="成绩标志：缓考">0</a></td><td>0</td><td></td><td></td><td>2</td></tr>
      <tr><td>补考已出</td><td>43</td><td>78</td><td>0</td><td></td><td>2</td></tr>
      <tr><td>缓考已出</td><td>0</td><td>0</td><td>82</td><td>缓考</td><td>2</td></tr>
    </table>`);
  });
  expect(rows.map(r => r.status)).toEqual(["pending", "pass", "pass"]);
  expect(rows.map(r => r.score)).toEqual(["缓考", "78", "82"]);
});

test("unconfirmed makeup zero is distinct from a real failed result", async ({ page }) => {
  await open(page);
  const rows = await page.evaluate(async () => {
    // @ts-ignore
    const { parseGradesJson } = await import("/src/services/parser.ts");
    return parseGradesJson({ rows: [
      { kcmc: "补考零分待核实", zcj: "0", ksxz: "补考", bkcj: "0" },
      { kcmc: "补考明确不及格", zcj: "0", ksxz: "补考", bkcj: "不及格" },
      { kcmc: "补考真实低分", zcj: "42", ksxz: "补考" },
      { kcmc: "正考真实零分", zcj: "0" },
      { kcmc: "补考明确零分", zcj: "0", ksxz: "补考", cjbz: "不及格" },
      { kcmc: "未参加补考", zcj: "0", ksxz: "补考", cjbz: "缺考" },
    ] });
  });
  expect(rows.map(r => r.status)).toEqual(["unknown", "fail", "fail", "fail", "fail", "fail"]);
});

test("cache round trip preserves replacement results despite original absence remark", async ({ page }) => {
  await open(page);
  const rows = await page.evaluate(async () => {
    // @ts-ignore
    const { parseGradesJson } = await import("/src/services/parser.ts");
    // @ts-ignore
    const { readGradeCache, saveGradeCache } = await import("/src/services/grade-cache.ts");
    const input = parseGradesJson({ rows: [
      { kcmc: "补考覆盖缺考", zcj: "0", cjbz: "缺考", bkcj: "75", ksxz: "补考" },
      { kcmc: "缓考覆盖旷考", zcj: "0", cjbz: "旷考", hkcj: "84", ksxz: "缓考" },
    ] });
    saveGradeCache("all", input);
    return { input, cached: readGradeCache("all") };
  });
  expect(rows.input.map(r => r.status)).toEqual(["pass", "pass"]);
  expect(rows.cached).toEqual(rows.input);
});

test("legacy cache uses retained makeup evidence instead of obsolete fail flag", async ({ page }) => {
  await open(page);
  const rows = await page.evaluate(async () => {
    // @ts-ignore
    const { readGradeCache } = await import("/src/services/grade-cache.ts");
    localStorage.setItem("shst_grades", JSON.stringify({ version: 2, byTerm: { all: [
      { name: "旧补考缓存", score: "0", originalScore: "0", makeupScore: "75", examNature: "补考", isPass: false, status: "fail", gpa: 0 },
      { name: "旧缓考缓存", score: "0", examNature: "缓考", isPass: false, status: "fail", gpa: 0 },
    ] } }));
    return readGradeCache("all");
  });
  expect(rows[0]).toMatchObject({ score: "75", status: "pass", isPass: true, gpa: 2.5 });
  expect(rows[1]).toMatchObject({ score: "缓考", status: "pending", isPass: false });
});

test("opaque school status codes are not guessed and JSON grade markup is parsed", async ({ page }) => {
  await open(page);
  const rows = await page.evaluate(async () => {
    // @ts-ignore
    const { parseGradesJson } = await import("/src/services/parser.ts");
    return parseGradesJson({ rows: [
      { kcmc: "数字标记", zcj: "0", cjbz: 9 },
      { kcmc: "数字考试性质", zcj: "0", ksxz: 9 },
      { kcmc: "数字性质已出分", zcj: "85", ksxz: 9 },
      { kcmc: "HTML字段缓考", zcj: '<span title="缓考">0</span>' },
      { kcmc: "课程名不是状态补考", zcj: "0" },
    ] });
  });
  expect(rows.map(r => r.status)).toEqual(["unknown", "unknown", "pass", "pending", "fail"]);
  expect(rows[3].score).toBe("缓考");
});

test("old effective result without stored source remains passed offline", async ({ page }) => {
  await open(page);
  const row = await page.evaluate(async () => {
    // @ts-ignore
    const { readGradeCache } = await import("/src/services/grade-cache.ts");
    localStorage.setItem("shst_grades", JSON.stringify([
      { name: "旧有效成绩", originalScore: "0", score: "80", remark: "缺考", examNature: "补考", isPass: true, gpa: 3 },
    ]));
    return readGradeCache("all")[0];
  });
  expect(row).toMatchObject({ score: "80", originalScore: "0", status: "pass", gpa: 3 });
});

test("UI keeps deferred, ambiguous zero and passed makeup out of failed courses across reload", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("shst_user", JSON.stringify({
    isLoggedIn: true, account: "grade-ui", curTerm: "2026-2027-1",
  })));
  await page.route("**/api/jsxsd/**", route => route.abort());
  await page.route("**/api/jsxsd/kscj/cjcx_query", route => route.fulfill({ body: "OK" }));
  await page.route("**/api/jsxsd/kscj/cjcx_list", route => route.fulfill({ json: { rows: [
    { kcmc: "延后考试", zcj: "0", cjbzmc: "正常", bz: "缓考", xf: 2 },
    { kcmc: "补考尚不明确", zcj: "0", ksxz: "补考", bkcj: "0", xf: 2 },
    { kcmc: "补考已通过", zcj: "0", cjbz: "缺考", bkcj: "75", ksxz: "补考", xf: 2 },
    { kcmc: "真实不及格", zcj: "48", xf: 2 },
  ] } }));
  await page.goto("/grade");
  await expect(page.locator(".grade-item-card")).toHaveCount(4);
  await expect(page.locator(".stat-item").filter({ hasText: "未通过课程" }).locator("strong")).toHaveText("1");
  await expect(page.locator(".grade-item-card").filter({ hasText: "延后考试" })).toContainText("缓考待出分");
  await expect(page.locator(".grade-item-card").filter({ hasText: "补考尚不明确" })).toContainText("补考成绩待核实");
  await page.getByRole("button", { name: "补/缓考", exact: true }).click();
  await expect(page.locator(".grade-item-card")).toHaveCount(3);
  await page.unroute("**/api/jsxsd/kscj/cjcx_list");
  await page.unroute("**/api/jsxsd/kscj/cjcx_query");
  await page.reload();
  await expect(page.locator(".grade-item-card")).toHaveCount(4);
  await expect(page.locator(".grade-item-card").filter({ hasText: "补考已通过" })).toContainText("已通过");
  await page.getByRole("button", { name: "未通过", exact: true }).click();
  await expect(page.locator(".grade-item-card")).toHaveCount(1);
  await expect(page.locator(".grade-item-card")).toContainText("真实不及格");
});
