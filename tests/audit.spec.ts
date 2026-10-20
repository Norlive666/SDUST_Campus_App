import { test, expect } from "./fixtures";
test.use({ timezoneId: "Asia/Shanghai" });
const user = { isLoggedIn: true, account: "audit", curTerm: "2026-2027-1", curWeek: 8, weekAnchor: { term: "2026-2027-1", week: 8, monday: "2026-10-19" } };
async function seed(page, at = "2026-10-20T10:00:00+08:00") {
  await page.clock.install({ time: new Date(at) });
  await page.addInitScript(user => {
    if (!localStorage.getItem("shst_user")) {
      localStorage.setItem("shst_user", JSON.stringify(user));
      localStorage.setItem("shst_timetable", JSON.stringify([{ name: "秋季旧课表", day: 0, section: 0, weeks: [8] }]));
    }
  }, user);
  await page.route("**/api/jsxsd/**", route => route.abort());
}

test("semester survives Jan 1, rolls into spring and next academic year; old cache is not relabeled", async ({ page }) => {
  await seed(page); await page.goto("/profile");
  const result = await page.evaluate(async () => {
    // @ts-ignore Vite modules
    const { useUserStore } = await import("/src/stores/user.ts");
    // @ts-ignore
    const { useTimetableStore } = await import("/src/stores/timetable.ts");
    const u = useUserStore(), t = useTimetableStore();
    const snap = () => ({ term: u.curTerm, week: u.curWeek, cache: t.hasCache, courses: t.courses.length });
    u.syncCalendar(new Date("2027-01-01T12:00:00+08:00")); const january = snap();
    u.syncCalendar(new Date("2027-03-01T12:00:00+08:00")); const spring = snap();
    u.syncCalendar(new Date("2027-08-01T12:00:00+08:00")); const autumn = snap();
    u.syncCalendar(new Date("2028-03-01T12:00:00+08:00")); const nextSpring = snap();
    return { january, spring, autumn, nextSpring, raw: JSON.parse(localStorage.getItem("shst_timetable")!)[0].name };
  });
  expect(result.january.term).toBe("2026-2027-1"); expect(result.january.week).toBe(18);
  expect(result.spring).toEqual({ term: "2026-2027-2", week: 1, cache: false, courses: 0 });
  expect(result.autumn.term).toBe("2027-2028-1"); expect(result.nextSpring.term).toBe("2027-2028-2");
  expect(result.raw).toBe("秋季旧课表");
});

test("manual historic term survives a year; automatic switch resumes explicitly", async ({ page }) => {
  await seed(page); await page.goto("/profile");
  await page.getByRole("button", { name: /当前学期/ }).click();
  await page.getByRole("button", { name: /^2025-2026-1$/ }).click();
  await expect(page.getByRole("switch", { name: "自动切换学期" })).toHaveAttribute("aria-checked", "false");
  const result = await page.evaluate(async () => {
    // @ts-ignore
    const { useUserStore } = await import("/src/stores/user.ts");
    const u = useUserStore(); u.syncCalendar(new Date("2027-10-20T12:00:00+08:00")); return u.curTerm;
  });
  expect(result).toBe("2025-2026-1");
  await page.getByRole("switch", { name: "自动切换学期" }).click();
  await expect(page.getByRole("button", { name: /当前学期/ })).toContainText("2026-2027-1");
});

test("midnight semester transition clears old visible courses and updates week", async ({ page }) => {
  await seed(page, "2027-02-28T23:59:45+08:00"); await page.goto("/timetable");
  await expect(page.locator(".week-title-btn")).toContainText("第 25 周");
  await page.clock.fastForward(30_000);
  await expect(page.locator(".week-title-btn")).toContainText("第 1 周");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("shst_user")!).curTerm)).toBe("2026-2027-2");
  await expect(page.getByText("秋季旧课表", { exact: true })).toHaveCount(0);
});

test("late old-semester timetable response cannot overwrite new semester", async ({ page }) => {
  await seed(page); await page.goto("/profile");
  const result = await page.evaluate(async () => {
    // @ts-ignore
    const { api } = await import("/src/services/api.ts");
    // @ts-ignore
    const { useUserStore } = await import("/src/stores/user.ts");
    // @ts-ignore
    const { useTimetableStore } = await import("/src/stores/timetable.ts");
    const u = useUserStore(), t = useTimetableStore();
    let release: (data: any) => void = () => {};
    api.getTimetable = () => new Promise(resolve => { release = resolve; });
    const loading = t.fetchTimetable(u.curTerm);
    u.setCurTerm("2026-2027-2");
    release({ courses: [{ name: "不应写入", day: 0, section: 0, weeks: [1] }] });
    await loading;
    return { term: u.curTerm, courses: t.courses, cache: t.hasCache };
  });
  expect(result).toEqual({ term: "2026-2027-2", courses: [], cache: false });
});

test("grade matrix handles real zero, missing, absence, deferred, makeup, qualitative results and official zero GPA", async ({ page }) => {
  await seed(page); await page.goto("/profile");
  const result = await page.evaluate(async () => {
    // @ts-ignore
    const { parseGradesJson, parseGradesHtml } = await import("/src/services/parser.ts");
    const input = [
      { zcj: "0" }, { zcj: "" }, { zcj: "缺考" }, { zcj: "0", cjbz: "旷考" }, { zcj: "作弊" },
      { zcj: "0", ksxz: "缓考", bkcj: "0" }, { zcj: "0", ksxz: "补考", bkcj: "65" },
      { zcj: "83", bkcj: "0" }, { zcj: "52", bkcj: "及格" }, { zcj: "0", ksxz: "缓考", bkcj: "不及格" },
      { zcj: "免修" }, { zcj: "合格" }, { zcj: "不合格" }, { zcj: "未公布等级" }, { zcj: "88", jd: 0, xf: 0 },
      { zcj: "59.9" }, { zcj: "60" }, { zcj: "优秀" }, { zcj: "", ksxz: "补考" },
      { zcj: "0", cjbz: "待出分" }, { zcj: "88备注" }, { zcj: "82", ksxz: 1, cjbz: 0 },
      { zcj: "", bkcj: "0" }, { zcj: "0", cjbz: "免修" },
    ].map((r, i) => ({ kcmc: `课程${i}`, xf: 2, ...r }));
    const rows = parseGradesJson({ data: { rows: input } });
    const html = '<table id="dataList"><tr><th>课程名称</th><th>平时成绩</th><th>期末成绩</th><th>总评成绩</th><th>成绩标识</th><th>备注</th><th>学分</th><th>考试性质</th></tr><tr><td>缺考课</td><td>80</td><td>0</td><td>0</td><td>缺考</td><td>已审核</td><td>3</td><td>正常考试</td></tr><tr><td>正常课</td><td>20</td><td>59</td><td>81</td><td></td><td></td><td>2</td><td>正常考试</td></tr></table>';
    return { rows, html: parseGradesHtml(html) };
  });
  expect(result.rows.map(r => r.status)).toEqual(["fail", "pending", "fail", "fail", "fail", "pending", "pass", "pass", "pass", "fail", "exempt", "pass", "fail", "unknown", "pass", "fail", "pass", "pass", "pending", "pending", "unknown", "pass", "pending", "exempt"]);
  expect(result.rows[0].score).toBe("0"); expect(result.rows[1].score).toBe("暂无成绩");
  expect(result.rows[5].score).toBe("缓考"); expect(result.rows[6].score).toBe("65");
  expect(result.rows[7].score).toBe("83"); expect(result.rows[8].score).toBe("及格");
  expect(result.rows[14].gpa).toBe(0); expect(result.rows[14].credit).toBe(0);
  expect(result.html[0].score).toBe("缺考"); expect(result.html[0].isPass).toBe(false);
  expect(result.html[1].score).toBe("81"); expect(result.html[1].credit).toBe(2);
});

test("grade UI filters pending separately from pass/fail and excludes pending from GPA", async ({ page }) => {
  await seed(page);
  await page.route("**/api/jsxsd/kscj/cjcx_query", route => route.fulfill({ body: "OK" }));
  await page.route("**/api/jsxsd/kscj/cjcx_list", route => route.fulfill({ json: { rows: [
    { kcmc: "缺考课", zcj: "缺考", xf: 2 }, { kcmc: "缓考课", zcj: "0", ksxz: "缓考", xf: 10 },
    { kcmc: "通过课", zcj: "80", jd: 3, xf: 2 }, { kcmc: "免修课", zcj: "免修", xf: 10 },
  ] } }));
  await page.goto("/grade");
  await expect(page.locator(".grade-item-card")).toHaveCount(4);
  await expect(page.locator(".gpa-value")).toHaveText("1.50");
  await page.getByRole("button", { name: "未通过", exact: true }).click();
  await expect(page.locator(".grade-item-card")).toHaveCount(1);
  await expect(page.locator(".grade-item-card")).toContainText("缺考课");
  await page.getByRole("button", { name: "待出分", exact: true }).click();
  await expect(page.locator(".grade-item-card")).toContainText("缓考课");
  await expect(page.locator(".grade-item-card")).not.toContainText("已通过");
});

test("exam day arithmetic is local-calendar based, including midnight, leap days and same-day finish", async ({ page }) => {
  await seed(page); await page.goto("/profile");
  const result = await page.evaluate(async () => {
    // @ts-ignore
    const { examTiming } = await import("/src/services/exam-time.ts");
    return [
      examTiming("2026-10-20 09:00–11:00", new Date("2026-10-20T00:01:00+08:00")),
      examTiming("2026-10-20 09:00–11:00", new Date("2026-10-20T10:00:00+08:00")),
      examTiming("2026-10-20 09:00–11:00", new Date("2026-10-20T11:00:00+08:00")),
      examTiming("2026-10-21 09:00–11:00", new Date("2026-10-20T23:59:00+08:00")),
      examTiming("2028/2/29 09:00–11:00", new Date("2028-02-28T12:00:00+08:00")),
      examTiming("2027-02-29"), examTiming("待排考"),
    ];
  });
  expect(result[0]).toMatchObject({ daysLeft: 0, phase: "upcoming" });
  expect(result[1].phase).toBe("ongoing"); expect(result[2].phase).toBe("ended");
  expect(result[3].daysLeft).toBe(1); expect(result[4].daysLeft).toBe(1);
  expect(result[5].phase).toBe("unknown"); expect(result[6].phase).toBe("unknown");
});

test("cached exam countdown refreshes across midnight without network", async ({ page }) => {
  await seed(page, "2026-10-19T23:59:45+08:00");
  await page.addInitScript(() => localStorage.setItem("shst_exams", JSON.stringify({ byTerm: { "2026-2027-1": [
    { name: "跨日考试", time: "2026-10-20 09:00–11:00", location: "J1", seat: "2", daysLeft: 999 },
  ] } })));
  await page.goto("/exam");
  await expect(page.locator(".exam-countdown strong")).toHaveText("1");
  await page.clock.fastForward(30_000);
  await expect(page.locator(".exam-countdown strong")).toHaveText("0");
  await page.clock.fastForward(12 * 3600_000);
  await expect(page.locator(".exam-status")).toHaveText("已结束");
  await expect(page.locator(".exam-total")).toHaveText("0 场待考");
});

test("exam HTML headers determine course and seat, independent of column order", async ({ page }) => {
  await seed(page); await page.goto("/profile");
  const rows = await page.evaluate(async () => {
    // @ts-ignore
    const { parseExamsHtml } = await import("/src/services/parser.ts");
    return parseExamsHtml('<table><tr><th>课程编号</th><th>座位号</th><th>考试时间</th><th>课程名称</th><th>考试地点</th></tr><tr><td>123</td><td>06</td><td>2026-10-20 09:00–11:00</td><td>复变函数</td><td>J3-108</td></tr></table>');
  });
  expect(rows[0]).toMatchObject({ name: "复变函数", seat: "06", location: "J3-108" });
});

test("JSON errors are rejected; grade pagination loads every page and keeps query term", async ({ page }) => {
  await seed(page); await page.goto("/profile");
  const result = await page.evaluate(async () => {
    // @ts-ignore
    const { requireDataPage, isLoginResponse } = await import("/src/services/response.ts");
    // @ts-ignore
    const { api } = await import("/src/services/api.ts");
    // @ts-ignore
    const { http } = await import("/src/services/http.ts");
    const failures: boolean[] = [];
    for (const data of [{ code: 500, msg: "维护" }, { code: 200, data: null }, "<html>维护</html>"]) {
      try { requireDataPage(data, "grades"); failures.push(false); } catch (_) { failures.push(true); }
    }
    const requests: any[] = [];
    http.request = async (options: any) => {
      if (options.url === "kscj/cjcx_query") return { status: 200, data: "OK", headers: {} };
      const p = options.data || options.params;
      requests.push({ term: p.kksj, page: p.pageNum });
      return { status: 200, headers: {}, data: { total: 2, rows: [{ kcmc: `课程${p.pageNum}`, zcj: "80", xf: 2 }] } };
    };
    return { failures, loggedOut: isLoginResponse({ status: 200, data: { code: 401 } }), rows: await api.getGrades("2026-2027-1"), requests };
  });
  expect(result.failures).toEqual([true, true, true]); expect(result.loggedOut).toBe(true);
  expect(result.rows).toHaveLength(2);
  expect(result.requests).toEqual([{ term: "2026-2027-1", page: 1 }, { term: "2026-2027-1", page: 2 }]);
});


test("week dates stay anchored before semester start and after week 25", async ({ page }) => {
  await seed(page, "2026-08-01T12:00:00+08:00");
  await page.goto("/timetable");
  await expect(page.locator(".week-title-btn")).toContainText("8/31 — 9/06");
  await page.clock.setFixedTime(new Date("2027-02-28T12:00:00+08:00"));
  await page.reload();
  await expect(page.locator(".week-title-btn")).toContainText("第 25 周");
  await expect(page.locator(".week-title-btn")).toContainText("2/15 — 2/21");
});
