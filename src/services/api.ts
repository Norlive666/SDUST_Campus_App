import { http } from "./http";
import { credentials } from "./credentials";
import { recognizeVerifyCode } from "./captcha";
import {
  isLoginResponse,
  requireDataPage,
  SessionExpiredError,
} from "./response";
import { encodeCredentials } from "./encrypt";
import {
  parseTimetableHtml,
  dataRows,
  parseGradesHtml,
  parseExamsHtml,
  parseStudentInfoHtml,
  CourseItem,
  GradeItem,
  ExamItem,
  StudentInfo,
  TimetableParseResult,
} from "./parser";

export interface PreLoginInfo {
  scode: string;
  sxh: string;
}

export interface LoginResult {
  success: boolean;
  message?: string;
  studentInfo?: Partial<StudentInfo>;
}

class ApiService {
  private lastPreInfo: PreLoginInfo | null = null;
  private renewal: Promise<void> | null = null;
  private sessionVersion = 0;
  private authGeneration = 0;

  invalidateSession() {
    this.sessionVersion++;
    this.lastPreInfo = null;
    this.renewal = null;
  }

  private async restoreSession(): Promise<void> {
    if (this.renewal) return this.renewal;
    const version = this.sessionVersion;
    const renewal = (async () => {
      const saved = await credentials.read();
      let account = "";
      try {
        account =
          JSON.parse(localStorage.getItem("shst_user") || "{}").account || "";
      } catch (_) {}
      if (!saved || saved.account !== account) throw new SessionExpiredError();
      for (let attempt = 0; attempt < 3; attempt++) {
        if (version !== this.sessionVersion) throw new SessionExpiredError();
        this.lastPreInfo = null;
        await http.clearCookie();
        await this.getPreLoginInfo();
        const image = await this.getCaptchaBase64();
        const code = await recognizeVerifyCode(image);
        if (code.length !== 4) continue;
        if (version !== this.sessionVersion) throw new SessionExpiredError();
        const result = await this.login(
          saved.account,
          saved.password,
          code,
          false,
        );
        if (version !== this.sessionVersion) throw new SessionExpiredError();
        if (result.success) {
          this.authGeneration++;
          return;
        }
        if (!/验证码/.test(result.message || ""))
          throw new SessionExpiredError(
            "自动登录未成功，请重新验证账号密码；已有缓存仍可查看",
          );
      }
      throw new SessionExpiredError(
        "自动识别验证码未成功，请手动验证登录；已有缓存仍可查看",
      );
    })();
    this.renewal = renewal;
    try {
      await renewal;
    } finally {
      if (this.renewal === renewal) this.renewal = null;
    }
  }

  private async authenticatedRequest(
    options: Parameters<typeof http.request>[0],
  ) {
    const version = this.sessionVersion;
    const generation = this.authGeneration;
    if (this.renewal) await this.renewal;
    let response = await http.request<string>(options);
    if (version !== this.sessionVersion) throw new SessionExpiredError();
    if (isLoginResponse(response)) {
      // Another request may already have renewed the server session while this
      // response was in flight. Retry once before starting another renewal.
      if (this.renewal) await this.renewal;
      else if (generation === this.authGeneration) await this.restoreSession();
      response = await http.request<string>(options);
      if (version !== this.sessionVersion || isLoginResponse(response))
        throw new SessionExpiredError();
    }
    if (response.status < 200 || response.status >= 300)
      throw new Error("教务请求失败，请检查校园网后重试");
    return response;
  }

  private async queryPages<T>(options: Parameters<typeof http.request>[0], kind: "grades" | "exams", parse: (source: any) => T[]): Promise<T[]> {
    const version = this.sessionVersion;
    const rows: T[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= 50; page++) {
      const request = { ...options };
      if (request.method === "GET") request.params = { ...options.params, pageNum: page };
      else request.data = { ...(typeof options.data === "object" ? options.data : {}), pageNum: page };
      const response = await this.authenticatedRequest(request);
      if (version !== this.sessionVersion) throw new SessionExpiredError();
      requireDataPage(response.data, kind);
      const parsed = parse(response.data);
      let json: any = response.data;
      if (typeof json === "string") { try { json = JSON.parse(json); } catch (_) { json = null; } }
      const metadata = json?.data && !Array.isArray(json.data) ? json.data : json;
      const total = Number(metadata?.total ?? metadata?.recordsTotal ?? json?.total);
      const pages = Number(metadata?.pages ?? metadata?.totalPages);
      const hasMore = Number.isFinite(total) ? rows.length + parsed.length < total : Number.isFinite(pages) ? page < pages : metadata?.hasNext === true;
      if (parsed.length) {
        const fingerprint = JSON.stringify(dataRows(json).length ? dataRows(json) : parsed);
        if (seen.has(fingerprint)) throw new Error("教务分页返回了重复数据，未覆盖缓存");
        seen.add(fingerprint);
      }
      rows.push(...parsed);
      if (!hasMore) return rows;
      if (!parsed.length) throw new Error("教务分页数据不完整，已保留缓存");
    }
    throw new Error("教务分页超过查询上限，已保留缓存");
  }

  /**
   * 1. 抓取登录前置参数 (scode & sxh)
   */
  async getPreLoginInfo(): Promise<PreLoginInfo> {
    try {
      const res = await http.request<string>({
        url: "",
        method: "GET",
      });

      const html = res.data;
      const scodeMatch = html.match(/scode[\s=]+['"](.*?)['"]/);
      const sxhMatch = html.match(/sxh[\s=]+['"](.*?)['"]/);

      if (scodeMatch && sxhMatch) {
        this.lastPreInfo = {
          scode: scodeMatch[1],
          sxh: sxhMatch[1],
        };
        return this.lastPreInfo;
      }
      throw new Error("未能在页面中匹配到 scode / sxh 加密参数");
    } catch (e: any) {
      console.warn("获取前置登录参数失败:", e.message);
      throw e;
    }
  }

  /**
   * 2. 获取图片验证码 (转换为 Base64)
   * 无论在 Web 还是 Android Capacitor 原生环境均做严格适配
   */
  async getCaptchaBase64(): Promise<string> {
    try {
      const res = await http.request<any>({
        url: "verifycode.servlet",
        method: "GET",
        responseType: "arraybuffer",
        params: { _t: Date.now() },
      });

      let base64 = "";
      const rawData = res.data;

      if (typeof rawData === "string") {
        const trimmed = rawData.trim();
        if (trimmed.startsWith("data:image")) {
          base64 = trimmed;
        } else {
          base64 = `data:image/jpeg;base64,${trimmed}`;
        }
      } else if (rawData instanceof ArrayBuffer) {
        let binary = "";
        const bytes = new Uint8Array(rawData);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64 = `data:image/jpeg;base64,${btoa(binary)}`;
      } else if (rawData && typeof rawData === "object" && rawData.data) {
        const inner = String(rawData.data).trim();
        base64 = inner.startsWith("data:image")
          ? inner
          : `data:image/jpeg;base64,${inner}`;
      } else {
        throw new Error("验证码二进制数据格式解析失败");
      }

      return base64;
    } catch (e) {
      console.error("获取验证码失败:", e);
      throw e;
    }
  }

  /**
   * 3. 提交登录请求
   */
  async login(
    account: string,
    pass: string,
    code: string,
    loadStudent = true,
  ): Promise<LoginResult> {
    if (!this.lastPreInfo) {
      await this.getPreLoginInfo();
    }

    const { scode, sxh } = this.lastPreInfo!;
    const encoded = encodeCredentials(account, pass, scode, sxh);

    try {
      const res = await http.request<string>({
        url: "xk/LoginToXk",
        method: "POST",
        data: {
          loginMethod: "LoginToXk",
          userlanguage: "0",
          userAccount: account,
          userPassword: "",
          RANDOMCODE: code,
          encoded: encoded,
        },
      });

      const text = res.data || "";
      const destination =
        res.headers.Location || res.headers.location || res.url || "";
      if (
        !isLoginResponse(res) &&
        res.status >= 200 &&
        res.status < 400 &&
        (/个人中心|退出登录|xsMainV|framework\/xsMain|欢迎您/.test(text) ||
          /framework\/xsMain/.test(destination))
      ) {
        // 登录成功后，立即拉取学生信息
        let studentInfo: Partial<StudentInfo> = { account };
        try {
          const info = loadStudent ? await this.getStudentInfo() : null;
          if (info) studentInfo = { ...studentInfo, ...info };
        } catch (_) {}

        return { success: true, studentInfo };
      }

      // 提取错误提示
      const fontMatch = text.match(
        /<font[^>]*color=["']?red["']?[^>]*>(.*?)<\/font>/i,
      );
      const alertMatch = text.match(/alert\(['"](.*?)['"]\)/);
      let msg = "账号、密码或验证码有误";

      if (fontMatch) {
        msg = fontMatch[1].replace(/<[^>]+>/g, "").trim();
      } else if (alertMatch) {
        msg = alertMatch[1].trim();
      } else if (text.includes("验证码错误") || text.includes("验证码不正确")) {
        msg = "验证码输入错误，请刷新重试";
      }

      return { success: false, message: msg };
    } catch (e: any) {
      return { success: false, message: e.message || "网络连接异常" };
    }
  }

  /**
   * 4. 获取学生个人信息 (学院、专业、姓名)
   */
  async getStudentInfo(): Promise<Partial<StudentInfo> | null> {
    try {
      // 方式 1: 请求 grxx/xsxx (最全学籍卡片)
      const res = await this.authenticatedRequest({
        url: "grxx/xsxx",
        method: "GET",
      });
      const info = parseStudentInfoHtml(res.data);
      if (info.name || info.college) return info;

      // 方式 2: 备用请求 framework/xsMainV.htmlx
      const mainRes = await this.authenticatedRequest({
        url: "framework/xsMainV.htmlx",
        method: "GET",
      });
      return parseStudentInfoHtml(mainRes.data);
    } catch (e) {
      console.warn("获取个人信息失败:", e);
      return null;
    }
  }

  /**
   * 5. 获取课表
   */
  async getTimetable(term: string = ""): Promise<TimetableParseResult> {
    try {
      const res = await this.authenticatedRequest({
        url: "xskb/xskb_list.do",
        method: "POST",
        data: {
          xnxq01id: term || "", // 为空时自动默认当前正在进行学期
          sfFD: "1",
          viweType: "0",
          showallprint: "0",
          showkchprint: "0",
          showkink: "0",
          showfzmprint: "0",
          baseUrl: "/jsxsd",
          xsflMapListJsonStr: encodeURIComponent(
            "讲课学时,实践学时,实验学时,上机学时,课内实践学时",
          ),
        },
      });

      requireDataPage(res.data, "timetable");
      return parseTimetableHtml(res.data);
    } catch (e) {
      console.warn("获取课表异常:", e);
      throw e;
    }
  }

  /**
   * 6. 获取成绩 (支持 POST / GET 双协议自适应兜底与全量学期分页)
   */
  async getGrades(term: string = ""): Promise<GradeItem[]> {
    const kksj = term === "all" ? "" : term;
    try {
      // 预请求 cjcx_query（部分教务端用于初始化会话环境，若异常则平滑忽略）
      await this.authenticatedRequest({
        url: "kscj/cjcx_query",
        method: "GET",
      });
    } catch (error) { if (error instanceof SessionExpiredError) throw error; }

    const payload = {
      kksj,
      pageNum: 1,
      pageSize: 999,
      xsfs: "all",
      kcxz: "",
      kcsx: "",
      kcmc: "",
      sfxsbcxq: 1,
    };

    try {
      return await this.queryPages({
        url: "kscj/cjcx_list",
        method: "POST",
        data: payload,
      }, "grades", parseGradesHtml);
    } catch (error) {
      if (error instanceof SessionExpiredError) throw error;
      try {
        return await this.queryPages({
          url: "kscj/cjcx_list",
          method: "GET",
          params: payload,
        }, "grades", parseGradesHtml);
      } catch (err2) {
        if (err2 instanceof SessionExpiredError) throw err2;
        return await this.queryPages({
          url: "kscj/cjcx_list",
          method: "POST",
          data: { kksj, xsfs: "all", pageNum: 1, pageSize: 999 },
        }, "grades", parseGradesHtml);
      }
    }
  }

  /**
   * 7. 获取考试日程 (支持 POST / GET 双协议自适应兜底)
   */
  async getExams(term: string = ""): Promise<ExamItem[]> {
    const xnxqid = term === "all" ? "" : term;
    const payload = {
      xnxqid: xnxqid || "",
      pageNum: 1,
      pageSize: 999,
      xqlb: "",
    };

    const attempts = [
      { url: "xsks/xsksap_list", method: "POST" as const, data: payload },
      { url: "xsks/xsksap_list", method: "GET" as const, params: payload },
      { url: "xsks/xsks_list", method: "POST" as const, data: payload },
    ];
    let lastError: unknown;
    let validEmpty = false;
    for (const request of attempts) {
      try {
        const parsed = await this.queryPages(request, "exams", parseExamsHtml);
        if (parsed.length) return parsed;
        validEmpty = true;
      } catch (error) {
        if (error instanceof SessionExpiredError) throw error;
        lastError = error;
      }
    }
    if (validEmpty) return [];
    throw lastError || new Error("考试查询失败，已保留缓存");
  }
}

export const api = new ApiService();
