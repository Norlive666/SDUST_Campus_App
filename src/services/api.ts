import { http } from './http';
import { encodeCredentials } from './encrypt';
import {
  parseTimetableHtml,
  parseGradesHtml,
  parseExamsHtml,
  CourseItem,
  GradeItem,
  ExamItem,
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
      console.warn('获取前置登录参数失败，可能处于内网或外网未连通:', e.message);
      throw e;
    }
  }

  /**
   * 2. 获取图片验证码 (转换为 Base64)
   */
  async getCaptchaBase64(): Promise<string> {
    if (this.isMockMode) {
      // 演示模式返回一个通用占位验证码图 (SVG Base64)
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

      // 转换 ArrayBuffer 为 Base64
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
      return { success: true };
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
        text.includes('framework/xsMain')
      ) {
        return { success: true };
      }

      // 提取错误提示 (强智系统多用 <font color="red">...</font> 或 alert)
      const fontMatch = text.match(/<font[^>]*color=["']?red["']?[^>]*>(.*?)<\/font>/i);
      const alertMatch = text.match(/alert\(['"](.*?)['"]\)/);
      const msg = fontMatch ? fontMatch[1] : alertMatch ? alertMatch[1] : '账号、密码或验证码有误';

      return { success: false, message: msg };
    } catch (e: any) {
      return { success: false, message: e.message || '网络连接异常' };
    }
  }

  /**
   * 4. 获取课表
   */
  async getTimetable(term: string): Promise<CourseItem[]> {
    if (this.isMockMode) {
      return MOCK_COURSES;
    }

    try {
      const res = await http.request<string>({
        url: 'xskb/xskb_list.do',
        method: 'POST',
        data: {
          xnxq01id: term,
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
      console.warn('获取课表异常，返回离线/演示课表:', e);
      return MOCK_COURSES;
    }
  }

  /**
   * 5. 获取成绩
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
      console.warn('获取成绩异常，返回离线/演示成绩:', e);
      return MOCK_GRADES;
    }
  }

  /**
   * 6. 获取考试日程
   */
  async getExams(term: string = ''): Promise<ExamItem[]> {
    if (this.isMockMode) {
      return MOCK_EXAMS;
    }

    try {
      const res = await http.request<string>({
        url: 'xsks/xsksap_list',
        method: 'POST',
        data: {
          xnxqid: term,
          pageNum: '1',
          pageSize: '999',
          xqlb: '',
        },
      });

      return parseExamsHtml(res.data);
    } catch (e) {
      console.warn('获取考试异常，返回离线/演示日程:', e);
      return MOCK_EXAMS;
    }
  }

  /**
   * 7. 空教室查询
   */
  async getClassrooms(): Promise<typeof MOCK_CLASSROOMS> {
    return MOCK_CLASSROOMS;
  }
}

export const api = new ApiService();
