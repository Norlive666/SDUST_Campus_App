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
  parseGradesHtml,
  parseExamsHtml,
  parseStudentInfoHtml,
  CourseItem,
  GradeItem,
  ExamItem,
  StudentInfo,
  TimetableParseResult,
} from "./parser";
import {
  MOCK_USER,
  MOCK_COURSES,
  MOCK_GRADES,
  MOCK_EXAMS,
  MOCK_CLASSROOMS,
} from "./mock";

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
  public isMockMode = false;
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
      if (!saved || saved.account !== account || this.isMockMode)
        throw new SessionExpiredError();
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

  /**
   * 1. 抓取登录前置参数 (scode & sxh)
   */
  async getPreLoginInfo(): Promise<PreLoginInfo> {
    if (this.isMockMode) {
      this.lastPreInfo = { scode: "mock_code", sxh: "123456789" };
      return this.lastPreInfo;
    }

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
    if (this.isMockMode) {
      return { success: true, studentInfo: MOCK_USER };
    }

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
    if (this.isMockMode) return MOCK_USER;

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
    if (this.isMockMode) {
      return {
        courses: MOCK_COURSES,
        currentTerm: MOCK_USER.curTerm,
        currentWeek: MOCK_USER.curWeek,
      };
    }

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
   * 6. 获取成绩 (支持 POST / GET 双协议自适应兜底)
   */
  async getGrades(term: string = ""): Promise<GradeItem[]> {
    if (this.isMockMode) {
      return MOCK_GRADES;
    }

    const kksj = term === "all" ? "" : term;
    // Initialize the query page before submitting: the server may establish
    // module-specific state here. Never substitute a different semester.
    await this.authenticatedRequest({ url: "kscj/cjcx_query", method: "GET" });
    const params = { kksj, kcmc: "", kcxz: "", xsfs: "all" };
    try {
      const res = await this.authenticatedRequest({
        url: "kscj/cjcx_list",
        method: "POST",
        data: params,
      });
      requireDataPage(res.data, "grades");
      return parseGradesHtml(res.data);
    } catch (error) {
      if (error instanceof SessionExpiredError) throw error;
      const fallback = await this.authenticatedRequest({
        url: "kscj/cjcx_list",
        method: "GET",
        params,
      });
      requireDataPage(fallback.data, "grades");
      return parseGradesHtml(fallback.data);
    }
  }

  /**
   * 7. 获取考试日程 (支持 POST / GET 双协议自适应兜底)
   */
  async getExams(term: string = ""): Promise<ExamItem[]> {
    if (this.isMockMode) {
      return MOCK_EXAMS;
    }

    try {
      // 策略 1: POST 请求 xsks/xsksap_list
      const res = await this.authenticatedRequest({
        url: "xsks/xsksap_list",
        method: "POST",
        data: {
          xnxqid: term || "",
          xqlb: "",
        },
      });

      let parsed = parseExamsHtml(res.data);
      if (parsed.length > 0) return parsed;

      // 策略 2: GET 请求 xsks/xsksap_list
      const getRes = await this.authenticatedRequest({
        url: `xsks/xsksap_list?xnxqid=${encodeURIComponent(term || "")}`,
        method: "GET",
      });
      parsed = parseExamsHtml(getRes.data);
      if (parsed.length > 0) return parsed;

      // 策略 3: 备用 POST 请求 xsks/xsks_list
      const altRes = await this.authenticatedRequest({
        url: "xsks/xsks_list",
        method: "POST",
        data: { xnxqid: term || "" },
      });
      return parseExamsHtml(altRes.data);
    } catch (e) {
      console.warn("获取考试异常:", e);
      throw e;
    }
  }

  /**
   * 8. 空教室查询
   */
  async getClassrooms(): Promise<typeof MOCK_CLASSROOMS> {
    return MOCK_CLASSROOMS;
  }
}

export const api = new ApiService();
