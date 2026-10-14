import { http } from './http';
import { encodeCredentials } from './encrypt';
import {
  parseTimetableHtml,
  parseGradesHtml,
  parseExamsHtml,
  parseStudentInfoHtml,
  calculateCurrentTermAndWeek,
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
   */
  async getCaptchaBase64(): Promise<string> {
    if (this.isMockMode) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40" viewBox="0 0 100 40"><rect width="100" height="40" fill="#f3f4f6"/><text x="25" y="26" font-family="monospace" font-size="20" font-weight="bold" fill="#4F46E5">8866</text></svg>`;
      return `data:image/svg+xml;base64,${btoa(svg)}`;
    }

    try {
      const res = await http.request<ArrayBuffer>({
        url: 'verifycode.servlet',
        method: 'GET',
        responseType: 'arraybuffer',
        params: { _t: Date.now() },
      });

      let binary = '';
      const bytes = new Uint8Array(res.data);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return `data:image/jpeg;base64,${btoa(binary)}`;
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

      const text = res.data;
      if (
        res.status === 302 ||
        text.includes('个人中心') ||
        text.includes('退出登录') ||
        text.includes('xsMainV') ||
        text.includes('framework/xsMain') ||
        text.includes('jsxsd')
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
      const msg = fontMatch ? fontMatch[1] : alertMatch ? alertMatch[1] : '账号、密码或验证码有误';

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
      // 方式 1: 请求 grxx/xsxx
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

      const parsed = parseTimetableHtml(res.data);
      if (parsed.courses.length === 0) {
        // 如果特定学期无课，但在 HTML 里未报错，返回解析结果
        return parsed;
      }
      return parsed;
    } catch (e) {
      console.warn('获取课表异常:', e);
      return { courses: [] };
    }
  }

  /**
   * 6. 获取成绩
   */
  async getGrades(term: string = ''): Promise<GradeItem[]> {
    if (this.isMockMode) {
      return MOCK_GRADES;
    }

    try {
      const res = await http.request<string>({
        url: 'kscj/cjcx_list',
        method: 'POST',
        data: {
          kksj: term === 'all' ? '' : term,
          pageNum: '1',
          pageSize: '999',
          xsfs: 'all',
          kcxz: '',
          kcsx: '',
          kcmc: '',
          sfxsbcxq: '1',
        },
      });

      return parseGradesHtml(res.data);
    } catch (e) {
      console.warn('获取成绩异常:', e);
      return [];
    }
  }

  /**
   * 7. 获取考试日程
   */
  async getExams(term: string = ''): Promise<ExamItem[]> {
    if (this.isMockMode) {
      return MOCK_EXAMS;
    }

    try {
      // 优先请求 xsksap_list
      const res = await http.request<string>({
        url: 'xsks/xsksap_list',
        method: 'POST',
        data: {
          xnxqid: term || '',
          pageNum: '1',
          pageSize: '999',
          xqlb: '',
        },
      });

      const parsed = parseExamsHtml(res.data);
      if (parsed.length > 0) return parsed;

      // 备用请求 xsks_list
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
