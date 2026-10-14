import { defineStore } from 'pinia';
import { CourseItem } from '../services/parser';
import { api } from '../services/api';

const COLOR_PALETTE = [
  '#4F46E5', // 经典蓝
  '#0ea5e9', // 天空蓝
  '#10b981', // 翡翠绿
  '#f59e0b', // 琥珀黄
  '#8b5cf6', // 梦幻紫
  '#ec4899', // 玫瑰粉
  '#14b8a6', // 绿松石
  '#f43f5e', // 珊瑚红
  '#6366f1', // 靛蓝
  '#06b6d4', // 青蓝
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
    selectedWeek: 6,
    isLoading: false,
  }),

  getters: {
    /**
     * 获取指定周次中、指定星期 (0-6) 和节次 (0-4) 的课程列表
     */
    getCourseAt: (state) => {
      return (day: number, section: number, week: number) => {
        // 查找所有在该星期、该节次上课的课程
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
          };
        }

        // 如果当前周没课，但其它周有课（非本周课程置灰）
        const otherCourse = matches[0];
        return {
          ...otherCourse,
          isCurrentWeek: false,
          displayColor: '#94a3b8', // 灰色展示
        };
      };
    },

    /**
     * 今日课程
     */
    todayCourses: (state) => {
      const today = (new Date().getDay() + 6) % 7; // 转换成 0=周一 ... 6=周日
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

    async fetchTimetable(term: string) {
      this.isLoading = true;
      try {
        const data = await api.getTimetable(term);
        // 分配颜色
        this.courses = data.map((c) => ({
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
