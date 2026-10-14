import { defineStore } from 'pinia';
import { CourseItem } from '../services/parser';
import { api } from '../services/api';
import { useUserStore } from './user';

const COLOR_PALETTE = [
  '#ff914d', // 活力橙 (如 概率论)
  '#4caf50', // 清新绿 (如 毛概)
  '#ba68c8', // 优雅紫 (如 习概)
  '#42a5f5', // 经典蓝 (如 复变函数、大物)
  '#ffa726', // 温暖黄 (如 体育、模电)
  '#26a69a', // 湖水绿
  '#ec407a', // 蔷薇粉
  '#7e57c2', // 梦幻紫
  '#29b6f6', // 浅天蓝
  '#ef5350', // 珊瑚红 (如 劳动实践)
  '#78909c', // 蓝灰 (如 工程概论、形策)
  '#ab47bc', // 浅紫
];

function getCourseColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

export const useTimetableStore = defineStore('timetable', {
  state: () => ({
    courses: [] as CourseItem[],
    selectedWeek: 7,
    isLoading: false,
  }),

  getters: {
    getCourseAt: (state) => {
      return (day: number, section: number, week: number) => {
        const matches = state.courses.filter(
          (c) => c.day === day && c.section === section
        );

        if (matches.length === 0) return null;

        // 优先显示当前周在上课的课程
        const curWeekCourse = matches.find((c) => c.weeks.includes(week));
        if (curWeekCourse) {
          return {
            ...curWeekCourse,
            isCurrentWeek: true,
            displayColor: curWeekCourse.color || getCourseColor(curWeekCourse.name),
            hasConflict: matches.length > 1,
            allCourses: matches,
          };
        }

        // 非本周课程展示 (灰色，降低透明度)
        const otherCourse = matches[0];
        return {
          ...otherCourse,
          isCurrentWeek: false,
          displayColor: '#b0bec5',
          hasConflict: matches.length > 1,
          allCourses: matches,
        };
      };
    },

    todayCourses: (state) => {
      const today = (new Date().getDay() + 6) % 7;
      return state.courses
        .filter((c) => c.day === today && c.weeks.includes(state.selectedWeek))
        .sort((a, b) => a.section - b.section);
    },
  },

  actions: {
    init() {
      try {
        const saved = localStorage.getItem('shst_timetable');
        if (saved) {
          this.courses = JSON.parse(saved);
        }
      } catch (_) {}
    },

    save() {
      try {
        localStorage.setItem('shst_timetable', JSON.stringify(this.courses));
      } catch (_) {}
    },

    async fetchTimetable(term: string = '') {
      this.isLoading = true;
      const userStore = useUserStore();
      try {
        const result = await api.getTimetable(term);

        // 如果服务端返回了真实当前学期与当前教学周，自动同步校准
        if (result.currentTerm) {
          userStore.setCurTerm(result.currentTerm);
        }
        if (result.currentWeek && result.currentWeek > 0) {
          userStore.setCurWeek(result.currentWeek);
          this.selectedWeek = result.currentWeek;
        }
        // 如果课表中解析到了真实学生学籍信息，同步至 userStore
        if (result.studentInfo) {
          userStore.updateStudentInfo(result.studentInfo);
        }

        // 分配课程卡片颜色
        this.courses = result.courses.map((c) => ({
          ...c,
          color: getCourseColor(c.name),
        }));
        this.save();
      } finally {
        this.isLoading = false;
      }
    },
  },
});
