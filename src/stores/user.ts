import { defineStore } from "pinia";
import { useTimetableStore } from "./timetable";
import { credentials } from "../services/credentials";
import { http } from "../services/http";
import { api } from "../services/api";
import { readPersistedUser } from "../services/session-state";
import { calculateCurrentTermAndWeek, StudentInfo } from "../services/parser";

const initialTermAndWeek = calculateCurrentTermAndWeek();

export const useUserStore = defineStore("user", {
  state: () => ({
    isLoggedIn: false,
    account: "",
    name: "山科同学",
    college: "山东科技大学",
    major: "本科专业",
    className: "",
    curTerm: initialTermAndWeek.term, // 动态推算当前学期 如 2026-2027-1
    curWeek: initialTermAndWeek.week, // 动态推算当前第几周
  }),

  actions: {
    init() {
      const saved = readPersistedUser();
      if (saved) Object.assign(this, saved);
      else this.$reset();
    },

    save() {
      try {
        localStorage.setItem(
          "shst_user",
          JSON.stringify({
            isLoggedIn: this.isLoggedIn,
            account: this.account,
            name: this.name,
            college: this.college,
            major: this.major,
            className: this.className,
            curTerm: this.curTerm,
            curWeek: this.curWeek,
          }),
        );
      } catch (_) {}
    },

    async login(account: string, pass: string, code: string) {
      api.invalidateSession();
      const previousAccount = this.account;
      const res = await api.login(account, pass, code);
      let rememberFailed = false;
      if (res.success) {
        try {
          await credentials.save({ account, password: pass });
        } catch (_) {
          rememberFailed = true;
          try {
            await credentials.clear();
          } catch (_) {}
        }
        if (previousAccount !== account) {
          useTimetableStore().courses = [];
          localStorage.removeItem("shst_timetable");
          localStorage.removeItem("shst_grades");
          localStorage.removeItem("shst_exams");
        }
        this.isLoggedIn = true;
        this.account = account;

        if (res.studentInfo) {
          if (res.studentInfo.name) this.name = res.studentInfo.name;
          if (res.studentInfo.college) this.college = res.studentInfo.college;
          if (res.studentInfo.major) this.major = res.studentInfo.major;
          if (res.studentInfo.className)
            this.className = res.studentInfo.className;
        }
        this.save();
      }
      return { ...res, rememberFailed };
    },

    updateStudentInfo(info?: Partial<StudentInfo>) {
      if (!info) return;
      if (info.name) this.name = info.name;
      if (info.college) this.college = info.college;
      if (info.major) this.major = info.major;
      if (info.className) this.className = info.className;
      this.save();
    },

    async logout() {
      api.invalidateSession();
      useTimetableStore().courses = [];
      this.isLoggedIn = false;
      this.account = "";
      this.name = "山科同学";
      this.college = "山东科技大学";
      this.major = "本科专业";
      this.className = "";
      this.save();
      localStorage.removeItem("shst_timetable");
      localStorage.removeItem("shst_grades");
      localStorage.removeItem("shst_exams");
      await Promise.all([credentials.clear(), http.clearCookie()]);
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
