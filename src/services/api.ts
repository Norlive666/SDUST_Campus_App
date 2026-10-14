import { http } from './http';
import { encodeCredentials } from './encrypt';
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
} from './parser';
import {
  MOCK_USER,
  MOCK_COURSES,
  MOCK_GRADES,
  MOCK_EXAMS,
  MOCK_CLASSROOMS,
} from './mock';

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

  /**
   * 1. 抓取登录前置参数 (scode & sxh)
   */
  async getPreLoginInfo(): Promise<PreLoginInfo> {
    if (this.isMockMode) {
      this.lastPreInfo = { scode: 'mock_code', sxh: '123456789' };
      return this.lastPreInfo;
    }

    try {
      const res = await http.request<string>({
        url: '',
        method: 'GET',
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
      throw new Error('未能在页面中匹配到 scode / sxh 加密参数');
    } catch (e: any) {
      console.warn('获取前置登录参数失败:', e.message);
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
        url: 'verifycode.servlet',
        method: 'GET',
        responseType: 'arraybuffer',
        params: { _t: Date.now() },
      });

      let base64 = '';
      const rawData = res.data;

      if (typeof rawData === 'string') {
        const trimmed = rawData.trim();
        if (trimmed.startsWith('data:image')) {
          base64 = trimmed;
        } else {
          base64 = `data:image/jpeg;base64,${trimmed}`;
        }
      } else if (rawData instanceof ArrayBuffer) {
        let binary = '';
        const bytes = new Uint8Array(rawData);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64 = `data:image/jpeg;base64,${btoa(binary)}`;
      } else if (rawData && typeof rawData === 'object' && rawData.data) {
        const inner = String(rawData.data).trim();
        base64 = inner.startsWith('data:image') ? inner : `data:image/jpeg;base64,${inner}`;
      } else {
        throw new Error('验证码二进制数据格式解析失败');
      }

      return base64;
    } catch (e) {
      console.error('获取验证码失败:', e);
      throw e;
    }
  }

  /**
   * 3. 提交登录请求
   */
  async login(account: string, pass: string, code: string): Promise<LoginResult> {
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
        url: 'xk/LoginToXk',
        method: 'POST',
        data: {
          loginMethod: 'LoginToXk',
          userlanguage: '0',
          userAccount: account,
          userPassword: '',
          RANDOMCODE: code,
          encoded: encoded,
        },
      });

      const text = res.data || '';
      if (
        res.status === 302 ||
        text.includes('个人中心') ||
        text.includes('退出登录') ||
        text.includes('xsMainV') ||
        text.includes('framework/xsMain') ||
        text.includes('jsxsd') ||
        text.includes('欢迎您')
      ) {
        // 登录成功后，立即拉取学生信息
        let studentInfo: Partial<StudentInfo> = { account };
        try {
          const info = await this.getStudentInfo();
          if (info) studentInfo = { ...studentInfo, ...info };
        } catch (_) {}

        return { success: true, studentInfo };
      }

      // 提取错误提示
      const fontMatch = text.match(/<font[^>]*color=["']?red["']?[^>]*>(.*?)<\/font>/i);
      const alertMatch = text.match(/alert\(['"](.*?)['"]\)/);
      let msg = '账号、密码或验证码有误';

      if (fontMatch) {
        msg = fontMatch[1].replace(/<[^>]+>/g, '').trim();
      } else if (alertMatch) {
        msg = alertMatch[1].trim();
      } else if (text.includes('验证码错误') || text.includes('验证码不正确')) {
        msg = '验证码输入错误，请刷新重试';
      }

      return { success: false, message: msg };
    } catch (e: any) {
      return { success: false, message: e.message || '网络连接异常' };
    }
  }

  /**
   * 4. 获取学生个人信息 (学院、专业、姓名)
   */
  async getStudentInfo(): Promise<Partial<StudentInfo> | null> {
    if (this.isMockMode) return MOCK_USER;

    try {
      // 方式 1: 请求 grxx/xsxx (最全学籍卡片)
      const res = await http.request<string>({
        url: 'grxx/xsxx',
        method: 'GET',
      });
      const info = parseStudentInfoHtml(res.data);
      if (info.name || info.college) return info;

      // 方式 2: 备用请求 framework/xsMainV.htmlx
      const mainRes = await http.request<string>({
        url: 'framework/xsMainV.htmlx',
        method: 'GET',
      });
      return parseStudentInfoHtml(mainRes.data);
    } catch (e) {
      console.warn('获取个人信息失败:', e);
      return null;
    }
  }

  /**
   * 5. 获取课表
   */
  async getTimetable(term: string = ''): Promise<TimetableParseResult> {
    if (this.isMockMode) {
      return {
        courses: MOCK_COURSES,
        currentTerm: MOCK_USER.curTerm,
        currentWeek: MOCK_USER.curWeek,
      };
    }

    try {
      const res = await http.request<string>({
        url: 'xskb/xskb_list.do',
        method: 'POST',
        data: {
          xnxq01id: term || '', // 为空时自动默认当前正在进行学期
          sfFD: '1',
          viweType: '0',
          showallprint: '0',
          showkchprint: '0',
          showkink: '0',
          showfzmprint: '0',
          baseUrl: '/jsxsd',
          xsflMapListJsonStr: encodeURIComponent('讲课学时,实践学时,实验学时,上机学时,课内实践学时'),
        },
      });

      return parseTimetableHtml(res.data);
    } catch (e) {
      console.warn('获取课表异常:', e);
      return { courses: [] };
    }
  }

  /**
   * 6. 获取成绩 (支持 POST / GET 双协议自适应兜底)
   */
  async getGrades(term: string = ''): Promise<GradeItem[]> {
    if (this.isMockMode) {
      return MOCK_GRADES;
    }

    const kksj = term === 'all' ? '' : term;

    try {
      // 策略 1: 标准 POST 请求
      const res = await http.request<string>({
        url: 'kscj/cjcx_list',
        method: 'POST',
        data: {
          kksj: kksj,
          xsfs: 'all',
        },
      });

      let parsed = parseGradesHtml(res.data);
      if (parsed.length > 0) return parsed;

      // 策略 2: 带参数的 GET 请求
      const getRes = await http.request<string>({
        url: `kscj/cjcx_list?kksj=${encodeURIComponent(kksj)}&xsfs=all`,
        method: 'GET',
      });
      parsed = parseGradesHtml(getRes.data);
      if (parsed.length > 0) return parsed;

      // 策略 3: 默认无参 GET 请求（拉取默认学期）
      const defaultRes = await http.request<string>({
        url: 'kscj/cjcx_list',
        method: 'GET',
      });
      return parseGradesHtml(defaultRes.data);
    } catch (e) {
      console.warn('获取成绩异常:', e);
      return [];
    }
  }

  /**
   * 7. 获取考试日程 (支持 POST / GET 双协议自适应兜底)
   */
  async getExams(term: string = ''): Promise<ExamItem[]> {
    if (this.isMockMode) {
      return MOCK_EXAMS;
    }

    try {
      // 策略 1: POST 请求 xsks/xsksap_list
      const res = await http.request<string>({
        url: 'xsks/xsksap_list',
        method: 'POST',
        data: {
          xnxqid: term || '',
          xqlb: '',
        },
      });

      let parsed = parseExamsHtml(res.data);
      if (parsed.length > 0) return parsed;

      // 策略 2: GET 请求 xsks/xsksap_list
      const getRes = await http.request<string>({
        url: `xsks/xsksap_list?xnxqid=${encodeURIComponent(term || '')}`,
        method: 'GET',
      });
      parsed = parseExamsHtml(getRes.data);
      if (parsed.length > 0) return parsed;

      // 策略 3: 备用 POST 请求 xsks/xsks_list
      const altRes = await http.request<string>({
        url: 'xsks/xsks_list',
        method: 'POST',
        data: { xnxqid: term || '' },
      });
      return parseExamsHtml(altRes.data);
    } catch (e) {
      console.warn('获取考试异常:', e);
      return [];
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
