import { defineStore } from 'pinia';
import { api } from '../services/api';
import { MOCK_USER } from '../services/mock';

export const useUserStore = defineStore('user', {
  state: () => ({
    isLoggedIn: false,
    account: '',
    name: '山科同学',
    college: '计算机科学与工程学院',
    major: '软件工程',
    className: '软工2022-1班',
    curTerm: '2024-2025-1',
    curWeek: 6,
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
        this.name = `用户 ${account.slice(-4)}`;
        this.save();
      }
      return res;
    },

    logout() {
      this.isLoggedIn = false;
      this.account = '';
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
