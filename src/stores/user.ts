import { defineStore } from 'pinia';
import { api } from '../services/api';
import { MOCK_USER } from '../services/mock';
import { calculateCurrentTermAndWeek, StudentInfo } from '../services/parser';

const initialTermAndWeek = calculateCurrentTermAndWeek();

export const useUserStore = defineStore('user', {
  state: () => ({
    isLoggedIn: false,
    account: '',
    name: '山科同学',
    college: '山东科技大学',
    major: '本科专业',
    className: '',
    curTerm: initialTermAndWeek.term, // 动态推算当前学期 如 2026-2027-1
    curWeek: initialTermAndWeek.week, // 动态推算当前第几周
    isMockMode: false,
  }),

  actions: {
    init() {
      try {
        const saved = localStorage.getItem('shst_user');
        if (saved) {
          const parsed = JSON.parse(saved);
          Object.assign(this, parsed);
          api.isMockMode = this.isMockMode;
        } else {
          // 根据当前日期动态初始化
          const current = calculateCurrentTermAndWeek();
          this.curTerm = current.term;
          this.curWeek = current.week;
        }
      } catch (_) {}
    },

    save() {
      try {
        localStorage.setItem(
          'shst_user',
          JSON.stringify({
            isLoggedIn: this.isLoggedIn,
            account: this.account,
            name: this.name,
            college: this.college,
            major: this.major,
            className: this.className,
            curTerm: this.curTerm,
            curWeek: this.curWeek,
            isMockMode: this.isMockMode,
          })
        );
      } catch (_) {}
    },

    setMockMode(enable: boolean) {
      this.isMockMode = enable;
      api.isMockMode = enable;
      if (enable) {
        this.isLoggedIn = true;
        this.account = MOCK_USER.account;
        this.name = MOCK_USER.name;
        this.college = MOCK_USER.college;
        this.major = MOCK_USER.major;
        this.className = MOCK_USER.className;
        this.curTerm = MOCK_USER.curTerm;
        this.curWeek = MOCK_USER.curWeek;
        this.save();
      }
    },

    async login(account: string, pass: string, code: string, asMock = false) {
      if (asMock) {
        this.setMockMode(true);
        return { success: true };
      }

      this.isMockMode = false;
      api.isMockMode = false;
      const res = await api.login(account, pass, code);
      if (res.success) {
        this.isLoggedIn = true;
        this.account = account;

        if (res.studentInfo) {
          if (res.studentInfo.name) this.name = res.studentInfo.name;
          if (res.studentInfo.college) this.college = res.studentInfo.college;
          if (res.studentInfo.major) this.major = res.studentInfo.major;
          if (res.studentInfo.className) this.className = res.studentInfo.className;
        }
        this.save();
      }
      return res;
    },

    updateStudentInfo(info: Partial<StudentInfo>) {
      if (info.name) this.name = info.name;
      if (info.college) this.college = info.college;
      if (info.major) this.major = info.major;
      if (info.className) this.className = info.className;
      this.save();
    },

    logout() {
      this.isLoggedIn = false;
      this.account = '';
      this.name = '山科同学';
      this.college = '山东科技大学';
      this.major = '本科专业';
      this.save();
      localStorage.removeItem('shst_timetable');
      localStorage.removeItem('shst_grades');
      localStorage.removeItem('shst_exams');
      localStorage.removeItem('sdust_cookie');
    },

    setCurWeek(week: number) {
      this.curWeek = week;
      this.save();
    },

    setCurTerm(term: string) {
      this.curTerm = term;
      this.save();
    },
  },
});
