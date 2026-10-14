<template>
  <div class="timetable-page">
    <!-- 顶部导航栏 (仿照山科小站顶部结构) -->
    <header class="top-nav">
      <div class="week-title-btn" @click="showWeekPicker = true">
        <span class="week-text">第{{ timetableStore.selectedWeek }}周</span>
        <van-icon name="arrow-down" class="arrow-icon" />
      </div>

      <div class="nav-actions">
        <div class="nav-btn" @click="onRefresh" :title="'刷新课表'">
          <van-icon name="replay" :class="{ 'spin-icon': timetableStore.isLoading }" />
        </div>
        <div class="nav-btn" @click="prevWeek" :title="'上一周'">
          <van-icon name="arrow-left" />
        </div>
        <div class="nav-btn" @click="nextWeek" :title="'下一周'">
          <van-icon name="arrow" />
        </div>
      </div>
    </header>

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh" class="pull-refresh-box">
      <!-- 7天星期与日期表头 (完全仿照图二: Mon 10/12 ... Sun 10/18) -->
      <div class="dates-header">
        <div
          v-for="(dayItem, idx) in weekDateList"
          :key="idx"
          class="date-col"
        >
          <div class="day-name">{{ dayItem.name }}</div>
          <div class="day-date" :class="{ 'date-active': dayItem.isToday }">
            {{ dayItem.date }}
          </div>
        </div>
      </div>

      <!-- 课表主体 7 列网格 (100% 满屏等分，无左侧多余侧边栏挤压) -->
      <div class="timetable-grid">
        <div v-for="sIdx in 5" :key="sIdx" class="grid-row">
          <div
            v-for="(_, dIdx) in 7"
            :key="dIdx"
            class="grid-cell"
          >
            <template v-if="getCourse(dIdx, sIdx - 1)">
              <div
                class="course-card"
                :style="{ backgroundColor: getCourse(dIdx, sIdx - 1)?.displayColor }"
                :class="{ 'is-not-cur-week': !getCourse(dIdx, sIdx - 1)?.isCurrentWeek }"
                @click="openCourseDetail(getCourse(dIdx, sIdx - 1)!)"
              >
                <!-- 严格仿照图二 4 行文字展示：课程名 / 教室(无@) / 教师 / 周次 -->
                <div class="card-name">{{ getCourse(dIdx, sIdx - 1)?.name }}</div>
                <div class="card-room">{{ getCourse(dIdx, sIdx - 1)?.classroom || '教室未定' }}</div>
                <div class="card-teacher">{{ getCourse(dIdx, sIdx - 1)?.teacher }}</div>
                <div class="card-weeks">{{ getCourse(dIdx, sIdx - 1)?.rawWeeks }}</div>
                <!-- 多门课程冲突角标 -->
                <div v-if="getCourse(dIdx, sIdx - 1)?.hasConflict" class="corner-triangle"></div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="timetableStore.courses.length === 0 && !timetableStore.isLoading" class="empty-hint">
        <van-icon name="info-o" />
        <span>当前学期暂未查询到课表，可点击右上角刷新</span>
      </div>
    </van-pull-refresh>

    <!-- 周次选择器弹窗 -->
    <van-popup v-model:show="showWeekPicker" round position="bottom">
      <div class="picker-header">
        <span class="picker-title">选择教学周</span>
        <van-button size="small" type="primary" round @click="showWeekPicker = false">确定</van-button>
      </div>
      <div class="week-grid-container">
        <div
          v-for="w in 22"
          :key="w"
          class="week-chip"
          :class="{
            'chip-active': w === timetableStore.selectedWeek,
            'chip-current': w === userStore.curWeek
          }"
          @click="selectWeek(w)"
        >
          第 {{ w }} 周
        </div>
      </div>
    </van-popup>

    <!-- 课程详情弹窗 -->
    <van-dialog v-model:show="showDetailDialog" :title="activeCourse?.name" confirm-button-text="知道了">
      <div class="course-detail-content" v-if="activeCourse">
        <!-- 如果该时段有多门课程，全部详细列出 -->
        <template v-if="activeCourse.allCourses && activeCourse.allCourses.length > 1">
          <div
            v-for="(c, cIdx) in activeCourse.allCourses"
            :key="cIdx"
            class="conflict-course-item"
            :class="{ 'conflict-active': c.weeks.includes(timetableStore.selectedWeek) }"
          >
            <div class="conflict-title">
              {{ c.name }}
              <span v-if="c.weeks.includes(timetableStore.selectedWeek)" class="active-badge">当前周上课</span>
            </div>
            <div class="detail-item">
              <van-icon name="location-o" class="detail-icon" />
              <span class="label">教室：</span>
              <span class="val">{{ c.classroom || '待定' }}</span>
            </div>
            <div class="detail-item">
              <van-icon name="user-o" class="detail-icon" />
              <span class="label">教师：</span>
              <span class="val">{{ c.teacher || '未知教师' }}</span>
            </div>
            <div class="detail-item">
              <van-icon name="calendar-o" class="detail-icon" />
              <span class="label">周次：</span>
              <span class="val">{{ c.rawWeeks }}</span>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="detail-item">
            <van-icon name="location-o" class="detail-icon" />
            <span class="label">上课地点：</span>
            <span class="val">{{ activeCourse.classroom || '待定' }}</span>
          </div>
          <div class="detail-item">
            <van-icon name="user-o" class="detail-icon" />
            <span class="label">授课教师：</span>
            <span class="val">{{ activeCourse.teacher || '未知教师' }}</span>
          </div>
          <div class="detail-item">
            <van-icon name="calendar-o" class="detail-icon" />
            <span class="label">周次范围：</span>
            <span class="val">{{ activeCourse.rawWeeks }}</span>
          </div>
          <div class="detail-item">
            <van-icon name="clock-o" class="detail-icon" />
            <span class="label">节次时段：</span>
            <span class="val">{{ getSectionDesc(activeCourse.section) }}</span>
          </div>
        </template>
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { showToast } from 'vant';
import { useTimetableStore } from '../stores/timetable';
import { useUserStore } from '../stores/user';
import { CourseItem } from '../services/parser';

const timetableStore = useTimetableStore();
const userStore = useUserStore();

const showWeekPicker = ref(false);
const showDetailDialog = ref(false);
const activeCourse = ref<(CourseItem & { allCourses?: CourseItem[] }) | null>(null);
const refreshing = ref(false);

const weekDayLabels = ['Mon', 'Tue', 'Wed', 'Thur', 'Fri', 'Sat', 'Sun'];

const timeSlots = [
  { name: '1-2', start: '08:00', end: '09:35' },
  { name: '3-4', start: '10:05', end: '11:40' },
  { name: '5-6', start: '14:00', end: '15:35' },
  { name: '7-8', start: '16:00', end: '17:35' },
  { name: '9-10', start: '19:00', end: '20:35' },
];

/**
 * 动态推算所选教学周 7 天的日期 (格式如 10/12, 10/13... 并在当天下方标出激活指示条)
 */
const weekDateList = computed(() => {
  const now = new Date();
  const currentDayOfWeek = (now.getDay() + 6) % 7; // 0=Mon ... 6=Sun

  // 以当周周一为基准
  const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - currentDayOfWeek);
  const weekDiff = timetableStore.selectedWeek - userStore.curWeek;
  const targetMonday = new Date(thisMonday.getTime() + weekDiff * 7 * 86400000);

  return weekDayLabels.map((name, idx) => {
    const d = new Date(targetMonday.getTime() + idx * 86400000);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dateStr = `${m}/${day < 10 ? '0' + day : day}`;
    const isToday = timetableStore.selectedWeek === userStore.curWeek && idx === currentDayOfWeek;
    return {
      name,
      date: dateStr,
      isToday,
    };
  });
});

const getCourse = (dayIndex: number, sectionIndex: number) => {
  return timetableStore.getCourseAt(dayIndex, sectionIndex, timetableStore.selectedWeek);
};

const prevWeek = () => {
  if (timetableStore.selectedWeek > 1) {
    timetableStore.selectedWeek--;
  }
};

const nextWeek = () => {
  if (timetableStore.selectedWeek < 25) {
    timetableStore.selectedWeek++;
  }
};

const selectWeek = (w: number) => {
  timetableStore.selectedWeek = w;
  showWeekPicker.value = false;
};

const openCourseDetail = (course: CourseItem & { allCourses?: CourseItem[] }) => {
  activeCourse.value = course;
  showDetailDialog.value = true;
};

const getSectionDesc = (sec: number): string => {
  const slot = timeSlots[sec];
  return slot ? `第 ${slot.name} 节 (${slot.start} - ${slot.end})` : `第 ${sec + 1} 大节`;
};

const onRefresh = async () => {
  try {
    await timetableStore.fetchTimetable(userStore.curTerm || '');
    showToast({ type: 'success', message: '课表已同步' });
  } catch (_) {
    showToast('同步失败，请检查网络');
  } finally {
    refreshing.value = false;
  }
};

onMounted(() => {
  userStore.init();
  timetableStore.init();
  if (userStore.curWeek && userStore.curWeek > 0) {
    timetableStore.selectedWeek = userStore.curWeek;
  }
  if (timetableStore.courses.length === 0) {
    timetableStore.fetchTimetable(userStore.curTerm || '');
  }
});
</script>

<style scoped>
.timetable-page {
  min-height: 100vh;
  background-color: #ffffff;
  padding-bottom: 70px;
  box-sizing: border-box;
}

/* 顶部导航栏 */
.top-nav {
  height: 48px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  position: sticky;
  top: 0;
  z-index: 20;
}

.week-title-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.week-text {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
}

.arrow-icon {
  font-size: 14px;
  color: #64748b;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-btn {
  width: 32px;
  height: 32px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #475569;
  background: #ffffff;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.nav-btn:active {
  background: #f1f5f9;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 7天表头 */
.dates-header {
  display: flex;
  width: 100%;
  background: #ffffff;
  padding: 6px 0 2px;
  border-bottom: 1px solid #f1f5f9;
}

.date-col {
  flex: 1;
  width: calc(100% / 7);
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.day-name {
  font-size: 11px;
  font-weight: 500;
  color: #64748b;
  line-height: 1.2;
}

.day-date {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 3px;
  padding-bottom: 3px;
  border-bottom: 2.5px solid transparent;
  line-height: 1.2;
}

.date-active {
  color: #0284c7 !important;
  border-color: #0284c7 !important;
  font-weight: 700;
}

/* 课表网格 (5 行 × 7 列，满屏等宽) */
.timetable-grid {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: #ffffff;
}

.grid-row {
  display: flex;
  width: 100%;
  min-height: 130px;
  border-bottom: 1px solid #f1f5f9;
}

.grid-cell {
  flex: 1;
  width: calc(100% / 7);
  min-width: 0;
  height: 100%;
  padding: 1.5px;
  box-sizing: border-box;
}

/* 课程卡片 (完全对应图二山科小站样式) */
.course-card {
  width: 100%;
  height: 100%;
  border-radius: 3px;
  color: #ffffff;
  padding: 4px 2px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  text-align: center;
  position: relative;
  cursor: pointer;
  overflow: hidden;
  word-break: break-all;
  font-size: 10px;
  line-height: 1.25;
  gap: 2px;
}

.card-name {
  font-size: 10px;
  font-weight: 600;
  line-height: 1.22;
  margin-bottom: 1px;
}

.card-room {
  font-size: 9.5px;
  line-height: 1.2;
  opacity: 0.95;
}

.card-teacher {
  font-size: 9.5px;
  line-height: 1.2;
  opacity: 0.95;
}

.card-weeks {
  font-size: 9px;
  line-height: 1.2;
  opacity: 0.9;
}

.corner-triangle {
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  border-top: 11px solid rgba(255, 255, 255, 0.85);
  border-left: 11px solid transparent;
}

.is-not-cur-week {
  opacity: 0.52;
  filter: grayscale(45%);
}

/* 周次选择弹窗 */
.picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
}

.picker-title {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
}

.week-grid-container {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  padding: 20px;
  max-height: 320px;
  overflow-y: auto;
}

.week-chip {
  padding: 10px 0;
  text-align: center;
  font-size: 13px;
  background: #f1f5f9;
  color: #475569;
  border-radius: 10px;
  cursor: pointer;
}

.chip-active {
  background: #0284c7 !important;
  color: #ffffff !important;
  font-weight: 700;
}

.chip-current {
  border: 1px solid #0284c7;
  color: #0284c7;
}

/* 课程详情弹窗 */
.course-detail-content {
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
}

.conflict-course-item {
  padding: 10px;
  background: #f8fafc;
  border-radius: 8px;
  margin-bottom: 8px;
  border-left: 3px solid #cbd5e1;
}

.conflict-course-item.conflict-active {
  border-left-color: #0284c7;
  background: #f0f9ff;
}

.conflict-title {
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.active-badge {
  font-size: 11px;
  background: #0284c7;
  color: #ffffff;
  padding: 1px 6px;
  border-radius: 4px;
}

.detail-item {
  display: flex;
  align-items: center;
  font-size: 13px;
  margin-top: 4px;
}

.detail-icon {
  color: #0284c7;
  font-size: 15px;
  margin-right: 6px;
}

.detail-item .label {
  color: #64748b;
}

.detail-item .val {
  color: #1e293b;
  font-weight: 600;
}

.empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 30px 16px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 10px;
  font-size: 12px;
  color: #64748b;
}
</style>
